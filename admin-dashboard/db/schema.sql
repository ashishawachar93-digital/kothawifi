CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS admins (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL, password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS admin_login_failures (email text NOT NULL, attempted_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS admin_login_failures_window_idx ON admin_login_failures(email,attempted_at);
CREATE TABLE IF NOT EXISTS plans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, price_paise integer NOT NULL CHECK(price_paise >= 0), cost_paise integer NOT NULL DEFAULT 0 CHECK(cost_paise >= 0), validity_hours integer, time_limit_hours integer, quota_mb integer, simultaneous_users integer NOT NULL DEFAULT 1 CHECK(simultaneous_users > 0), freeisp_plan_id text, router_id text, realm text, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE plans ADD COLUMN IF NOT EXISTS time_limit_hours integer;
CREATE TABLE IF NOT EXISTS vouchers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL REFERENCES plans(id), username text NOT NULL UNIQUE, password text, code text, status text NOT NULL DEFAULT 'unused' CHECK(status IN ('unused','reserved','sold','disabled')), imported_at timestamptz NOT NULL DEFAULT now(), sold_at timestamptz, payment_id text UNIQUE, freeisp_user_id text, router_id text, realm text, expires_at timestamptz, UNIQUE(plan_id, username));
CREATE TABLE IF NOT EXISTS payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider text NOT NULL DEFAULT 'cashfree', provider_order_id text NOT NULL, provider_payment_id text NOT NULL, plan_id uuid NOT NULL REFERENCES plans(id), amount_paise integer NOT NULL CHECK(amount_paise >= 0), customer_phone text, status text NOT NULL, voucher_id uuid REFERENCES vouchers(id), raw_event jsonb NOT NULL DEFAULT '{}'::jsonb, paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider, provider_payment_id));
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_success_per_order ON payments(provider,provider_order_id);
CREATE TABLE IF NOT EXISTS payment_intents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_order_id text UNIQUE NOT NULL, plan_id uuid NOT NULL REFERENCES plans(id), amount_paise integer NOT NULL, customer_phone text NOT NULL, status text NOT NULL DEFAULT 'PENDING', created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS last_status_checked_at timestamptz;
CREATE INDEX IF NOT EXISTS payment_intent_phone_window_idx ON payment_intents(customer_phone,created_at);
CREATE TABLE IF NOT EXISTS usage_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), voucher_id uuid REFERENCES vouchers(id), username text NOT NULL, router_id text NOT NULL DEFAULT 'default', realm text, session_id text NOT NULL, started_at timestamptz, ended_at timestamptz, input_bytes bigint NOT NULL DEFAULT 0 CHECK(input_bytes >= 0), output_bytes bigint NOT NULL DEFAULT 0 CHECK(output_bytes >= 0), source text NOT NULL DEFAULT 'import', updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(router_id, session_id));
CREATE TABLE IF NOT EXISTS jio_costs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period_start date NOT NULL, period_end date NOT NULL, cost_paise bigint NOT NULL CHECK(cost_paise >= 0), total_gb numeric(14,3), note text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS vouchers_stock_idx ON vouchers(plan_id,status,imported_at);
CREATE INDEX IF NOT EXISTS payments_paid_idx ON payments(paid_at) WHERE status='SUCCESS';
CREATE INDEX IF NOT EXISTS usage_user_idx ON usage_sessions(username,started_at);

-- Seed the eight voucher plans present in the supplied stock workbook and the
-- current public catalogue. Skip any price that already has an active plan so
-- this remains safe to rerun and preserves plans that an operator already set up.
INSERT INTO plans(name,price_paise,validity_hours,time_limit_hours,quota_mb,simultaneous_users)
SELECT catalogue.name,catalogue.price_paise,catalogue.validity_hours,catalogue.time_limit_hours,catalogue.quota_mb,catalogue.simultaneous_users
FROM (VALUES
  ('1Rs - Welcome Trial',100,24,1,100,1),
  ('10Rs -3GB -24Hr',1000,24,24,3072,1),
  ('20Rs - 7GB - 2Day',2000,48,48,7168,1),
  ('25Rs - 10GB Premium',2500,24,24,10240,1),
  ('65Rs - 10GB Monthly',6500,720,720,10240,1),
  ('100Rs - 30GB Gaming',10000,720,720,30720,1),
  ('199Rs - Family',19900,720,720,51200,2),
  ('500Rs - 500GB - Home',50000,720,720,512000,11)
) AS catalogue(name,price_paise,validity_hours,time_limit_hours,quota_mb,simultaneous_users)
WHERE NOT EXISTS (
  SELECT 1 FROM plans p WHERE p.price_paise=catalogue.price_paise AND p.active=true
);
