type VoucherPdfDetails = {
  plan?: string;
  credential?: string | null;
  password?: string | null;
  code?: string | null;
};

function wrapText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string[] {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (context.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function downloadVoucherPdf(
  details: VoucherPdfDetails,
  orderId: string,
): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1697;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the voucher PDF.");

  context.fillStyle = "#f1f6f3";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.fillRect(58, 58, 1084, 1581);
  context.fillStyle = "#0c624d";
  context.fillRect(58, 58, 1084, 270);

  context.fillStyle = "#d8eee6";
  context.font = "700 25px Arial, sans-serif";
  context.fillText("KOTHA WIFI", 108, 120);
  context.fillStyle = "#ffffff";
  context.font = "700 58px Arial, sans-serif";
  context.fillText("Your WiFi voucher", 108, 182);
  context.font = "28px Arial, sans-serif";
  context.fillText("Payment confirmed · Keep these details private", 108, 240);

  let y = 390;
  const drawField = (label: string, value: string | null | undefined) => {
    if (!value) return;

    context.fillStyle = "#718079";
    context.font = "600 25px Arial, sans-serif";
    context.fillText(label, 108, y);
    y += 45;

    context.fillStyle = "#182126";
    context.font = "600 37px Arial, sans-serif";
    for (const line of wrapText(context, value, 980)) {
      context.fillText(line, 108, y);
      y += 54;
    }
    y += 35;
  };

  drawField("PLAN", details.plan);
  drawField(details.code ? "VOUCHER CODE" : "USERNAME / VOUCHER CODE", details.code || details.credential);
  if (details.code && details.credential && details.code !== details.credential) {
    drawField("USERNAME", details.credential);
  }
  drawField("PASSWORD", details.password);

  context.fillStyle = "#718079";
  context.font = "24px Arial, sans-serif";
  context.fillText("Order: " + orderId, 108, Math.min(y + 30, 1510));
  context.font = "22px Arial, sans-serif";
  context.fillText("Connect using the voucher details above. Do not share this PDF.", 108, 1570);

  const jpegBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not render the voucher PDF."))),
      "image/jpeg",
      0.94,
    );
  });
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let byteLength = 0;

  const append = (chunk: Uint8Array) => {
    chunks.push(chunk);
    byteLength += chunk.length;
  };
  const appendText = (text: string) => append(encoder.encode(text));

  const pageContent = "q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ\n";

  appendText("%PDF-1.4\n");
  offsets.push(byteLength);
  appendText("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  offsets.push(byteLength);
  appendText("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  offsets.push(byteLength);
  appendText(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
  );
  offsets.push(byteLength);
  appendText(
    "4 0 obj\n<< /Type /XObject /Subtype /Image /Width " +
      canvas.width +
      " /Height " +
      canvas.height +
      " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " +
      jpegBytes.length +
      " >>\nstream\n",
  );
  append(jpegBytes);
  appendText("\nendstream\nendobj\n");
  offsets.push(byteLength);
  appendText(
    "5 0 obj\n<< /Length " +
      encoder.encode(pageContent).length +
      " >>\nstream\n" +
      pageContent +
      "endstream\nendobj\n",
  );

  const xrefOffset = byteLength;
  appendText("xref\n0 6\n0000000000 65535 f \n");
  for (const offset of offsets) {
    appendText(String(offset).padStart(10, "0") + " 00000 n \n");
  }
  appendText(
    "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" +
      xrefOffset +
      "\n%%EOF\n",
  );

  const pdfBytes = new Uint8Array(byteLength);
  let cursor = 0;
  for (const chunk of chunks) {
    pdfBytes.set(chunk, cursor);
    cursor += chunk.length;
  }

  const file = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const objectUrl = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = "kotha-wifi-voucher-" + orderId + ".pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

