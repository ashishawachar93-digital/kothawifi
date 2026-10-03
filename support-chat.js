(() => {
  if (document.getElementById("kw-support-host")) return;

  const API = "https://kotha-wifi-admin.ashishawachar93.workers.dev/api/support/status";
  const host = document.createElement("div");
  host.id = "kw-support-host";
  host.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:10000";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      *{box-sizing:border-box;font-family:Arial,"Noto Sans Devanagari",sans-serif}
      .launcher{border:0;border-radius:28px;background:#0756b8;color:#fff;padding:13px 17px;font-size:14px;font-weight:800;box-shadow:0 8px 24px #10243d35;cursor:pointer}
      .panel{display:none;position:absolute;right:0;bottom:60px;width:min(365px,calc(100vw - 28px));height:min(540px,calc(100vh - 105px));background:white;border:1px solid #dfe8f1;border-radius:17px;box-shadow:0 16px 48px #10243d35;overflow:hidden;color:#10243d}
      .panel.open{display:flex;flex-direction:column}
      .head{background:#0756b8;color:#fff;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px}
      .title{font-size:14px;font-weight:800}.sub{font-size:10px;opacity:.85;margin-top:3px}
      .actions{display:flex;align-items:center;gap:5px}.lang,.close{border:1px solid #ffffff70;background:#ffffff18;color:#fff;border-radius:7px;padding:6px 7px;font-size:10px;font-weight:700;cursor:pointer}.close{font-size:17px;line-height:13px}
      .messages{padding:12px;display:flex;flex-direction:column;gap:9px;overflow:auto;flex:1;background:#f5f9fd}
      .msg{max-width:94%;padding:9px 11px;border-radius:12px;background:white;border:1px solid #e1eaf2;font-size:12px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
      .msg.bot{align-self:flex-start}.msg.user{align-self:flex-end;background:#e8f2ff;border-color:#cbdff6}
      .topics{display:grid;gap:6px;margin-top:3px}.topic{border:1px solid #b7cde5;background:#fff;color:#0756b8;border-radius:9px;padding:8px;text-align:left;font-size:11px;font-weight:700;cursor:pointer}
      .lookup{padding:11px 12px;border-top:1px solid #e2eaf2;background:#fff;display:grid;gap:7px}.lookup label{font-size:10px;font-weight:700;color:#53687c;display:grid;gap:4px}.lookup input{width:100%;padding:9px 10px;border:1px solid #d5e0ea;border-radius:8px;font-size:12px;color:#10243d}.lookup button{border:0;background:#07953b;color:#fff;border-radius:8px;padding:10px;font-size:12px;font-weight:800;cursor:pointer}.lookup button:disabled{opacity:.6;cursor:wait}
      .safety{text-align:center;font-size:9px;color:#708399;margin:0 12px 10px}
      .copy{display:inline-block;margin-top:7px;border:0;background:#0756b8;color:#fff;border-radius:7px;padding:6px 9px;font-weight:700;font-size:10px;cursor:pointer}
      @media(max-width:480px){.panel{right:-5px;bottom:58px;height:min(540px,calc(100vh - 95px))}.launcher{padding:12px 14px}}
    </style>
    <button class="launcher" type="button" aria-expanded="false">मराठी मदत / Help</button>
    <section class="panel" aria-label="Kotha WiFi support chat">
      <header class="head"><div><div class="title"></div><div class="sub"></div></div><div class="actions"><button class="lang" type="button">EN</button><button class="close" type="button" aria-label="Close">×</button></div></header>
      <div class="messages" aria-live="polite"></div>
      <form class="lookup">
        <label class="order-label"><span></span><input name="orderId" autocomplete="off" required maxlength="40"></label>
        <label class="phone-label"><span></span><input name="phone" autocomplete="tel" inputmode="tel" required maxlength="15"></label>
        <button type="submit"></button>
      </form>
      <p class="safety"></p>
    </section>`;

  const q = (selector) => root.querySelector(selector);
  const launcher = q(".launcher");
  const panel = q(".panel");
  const messages = q(".messages");
  const form = q(".lookup");
  let lang = "mr";
  const text = {
    mr: {
      title: "Digital Grampanchayat WiFi मदत", sub: "पेमेंट व व्हाउचरची स्थिती तपासा", launch: "मराठी मदत / Help", order: "Cashfree Order ID", phone: "पेमेंटवेळीचा मोबाइल नंबर", orderPlaceholder: "उदा. kw_…", phonePlaceholder: "10 अंकी मोबाइल नंबर", submit: "पेमेंट तपासा", safety: "UPI PIN, OTP किंवा कार्ड तपशील इथे कधीही देऊ नका.", welcome: "नमस्कार! मी पेमेंट आणि WiFi व्हाउचरबाबत मदत करतो. पेमेंट तपासण्यासाठी खाली Order ID आणि पेमेंटवेळीचा मोबाइल नंबर भरा.", topicPay: "पेमेंट झाले, व्हाउचर नाही", topicStatus: "पेमेंटची स्थिती तपासा", topicUse: "व्हाउचर कसे सुरू करायचे?", useAnswer: "Kotha WiFi ला connect करा. Hotspot login page उघडा, व्हाउचर कोड भरा आणि Activate दाबा. इंटरनेट सुरू न झाल्यास Order ID व मोबाइल नंबरने पेमेंट तपासा.", checking: "Cashfree आणि वेबसाइटवरील पेमेंट तपासत आहे…", invalid: "योग्य Order ID आणि 10 अंकी मोबाइल नंबर भरा.", notFound: "या Order ID आणि मोबाइल नंबरची जुळणारी नोंद सापडली नाही. दोन्ही तपासा. रक्कम कट झाली असल्यास Cashfree transaction आणि Order ID जतन करा.", success: "पेमेंट यशस्वी! तुमचा WiFi व्हाउचर कोड:", paidNoCode: "पेमेंट यशस्वी दिसत आहे, पण व्हाउचर अजून जोडलेले नाही. Order ID जतन करा आणि सेवा प्रदात्याशी संपर्क करा.", pending: "पेमेंट अजून confirm झालेले नाही. काही वेळाने पुन्हा तपासा. बँकेतून रक्कम कट झाली असल्यास Order ID जतन करा.", failed: "या ऑर्डरसाठी यशस्वी पेमेंट दिसत नाही. Cashfree मध्ये transaction status तपासा; रक्कम कट झाली असल्यास Order ID जतन करून संपर्क करा.", unavailable: "आत्ता पेमेंट तपासता आले नाही. थोड्या वेळाने पुन्हा प्रयत्न करा; रक्कम कट झाली असल्यास Order ID जतन करा.", copy: "कोड कॉपी करा", copied: "कॉपी झाला" },
    en: {
      title: "Digital Grampanchayat WiFi Help", sub: "Check payment and voucher status", launch: "मराठी मदत / Help", order: "Cashfree Order ID", phone: "Mobile number used for payment", orderPlaceholder: "e.g. kw_…", phonePlaceholder: "10 digit mobile number", submit: "Check payment", safety: "Never enter your UPI PIN, OTP, or card details here.", welcome: "Hello! I can help with payments and WiFi vouchers. To check a payment, enter the Cashfree Order ID and the mobile number used at checkout below.", topicPay: "Paid but no voucher", topicStatus: "Check payment status", topicUse: "How do I activate the voucher?", useAnswer: "Connect to Kotha WiFi, open the hotspot login page, enter the voucher code, and press Activate. If it does not connect, check the payment using your Order ID and mobile number.", checking: "Checking Cashfree and the website payment record…", invalid: "Enter a valid Order ID and 10 digit mobile number.", notFound: "No matching order and mobile number were found. Check both details. If money was deducted, keep your Cashfree transaction details and Order ID.", success: "Payment confirmed! Your WiFi voucher code:", paidNoCode: "Payment is confirmed, but a voucher is not attached yet. Keep the Order ID and contact the service provider.", pending: "Payment is not confirmed yet. Check again shortly. If money was deducted, keep the Order ID.", failed: "No successful payment is recorded for this order. Check the transaction status in Cashfree; if money was deducted, keep the Order ID and contact support.", unavailable: "Payment status could not be checked right now. Try again shortly; keep the Order ID if money was deducted.", copy: "Copy code", copied: "Copied" },
  };
  const say = (key) => text[lang][key];

  function addMessage(value, who = "bot", code = "") {
    const item = document.createElement("div");
    item.className = "msg " + who;
    item.textContent = value;
    if (code) {
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "copy";
      copy.textContent = say("copy");
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(code); copy.textContent = say("copied"); }
        catch { copy.textContent = code; }
      });
      item.appendChild(document.createElement("br"));
      item.appendChild(copy);
    }
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  }
  function addTopics() {
    const box = document.createElement("div");
    box.className = "topics";
    [["topicPay", "checking"], ["topicStatus", "checking"], ["topicUse", "useAnswer"]].forEach(([labelKey, answerKey]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "topic";
      button.textContent = say(labelKey);
      button.addEventListener("click", () => {
        addMessage(button.textContent, "user");
        addMessage(say(answerKey));
        if (answerKey === "checking") q('input[name="orderId"]').focus();
      });
      box.appendChild(button);
    });
    messages.appendChild(box);
  }
  function updateLanguage() {
    q(".title").textContent = say("title");
    q(".sub").textContent = say("sub");
    launcher.textContent = say("launch");
    q(".lang").textContent = lang === "mr" ? "EN" : "मराठी";
    q(".order-label span").textContent = say("order");
    q('input[name="orderId"]').placeholder = say("orderPlaceholder");
    q(".phone-label span").textContent = say("phone");
    q('input[name="phone"]').placeholder = say("phonePlaceholder");
    q(".lookup button").textContent = say("submit");
    q(".safety").textContent = say("safety");
  }
  updateLanguage();
  addMessage(say("welcome"));
  addTopics();

  launcher.addEventListener("click", () => {
    const open = panel.classList.toggle("open");
    launcher.setAttribute("aria-expanded", String(open));
    if (open) q('input[name="orderId"]').focus();
  });
  q(".close").addEventListener("click", () => {
    panel.classList.remove("open");
    launcher.setAttribute("aria-expanded", "false");
  });
  q(".lang").addEventListener("click", () => { lang = lang === "mr" ? "en" : "mr"; updateLanguage(); });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const orderId = String(form.elements.orderId.value || "").trim();
    const phone = String(form.elements.phone.value || "").trim();
    if (!/^kw_[a-f0-9]{24}$/i.test(orderId) || phone.replace(/\D/g, "").length < 10) {
      addMessage(say("invalid"));
      return;
    }
    addMessage(say("checking"));
    const button = q(".lookup button");
    button.disabled = true;
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, phone }),
      });
      const result = await response.json();
      if (result.result === "success") addMessage(say("success") + "\n" + (result.code || result.credential), "bot", result.code || result.credential);
      else if (result.result === "paid_no_voucher") addMessage(say("paidNoCode"));
      else if (result.result === "pending") addMessage(say("pending"));
      else if (result.result === "not_paid") addMessage(say("failed"));
      else if (result.result === "not_found" || result.result === "invalid") addMessage(say("notFound"));
      else addMessage(say("unavailable"));
    } catch {
      addMessage(say("unavailable"));
    } finally {
      button.disabled = false;
      messages.scrollTop = messages.scrollHeight;
    }
  });
})();
