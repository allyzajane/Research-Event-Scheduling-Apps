import jsPDF from "jspdf";

export interface CertSigner {
  user_name: string | null;
  user_role: string;
  user_email: string | null;
  signature_url: string;
  notes: string | null;
  signed_at: string;
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const cacheBusted = url + (url.includes("?") ? "&" : "?") + "_cb=" + Date.now();
    await new Promise<void>((resolve, reject) => {
      img.onload  = () => resolve();
      img.onerror = () => reject(new Error("img load failed"));
      img.src = cacheBusted;
    });
    const canvas = document.createElement("canvas");
    canvas.width  = img.naturalWidth  || img.width  || 400;
    canvas.height = img.naturalHeight || img.height || 120;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export async function generateSigningCertificate(opts: {
  documentTitle: string;
  documentDescription?: string | null;
  documentUrl: string;
  signers: CertSigner[];
  hospitalName?: string;
}): Promise<void> {
  const {
    documentTitle,
    documentDescription,
    documentUrl,
    signers,
    hospitalName = "Taif Children's Hospital",
  } = opts;

  const pdf  = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw   = pdf.internal.pageSize.getWidth();   // 210
  const ph   = pdf.internal.pageSize.getHeight();  // 297
  const ml   = 18; // margin left/right
  let y      = 0;

  // ── Header bar ─────────────────────────────────────────────
  pdf.setFillColor(13, 148, 136);
  pdf.rect(0, 0, pw, 38, "F");

  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text(hospitalName, ml, 16);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("Official Document Signing Certificate", ml, 26);

  const certDate = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
  pdf.setFontSize(7.5);
  pdf.text(`Generated: ${certDate}`, pw - ml, 26, { align: "right" });

  y = 48;

  // ── Document Details ────────────────────────────────────────
  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text("Document Details", ml, y);
  y += 5;

  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.3);
  pdf.line(ml, y, pw - ml, y);
  y += 6;

  const field = (label: string, value: string) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(label.toUpperCase(), ml, y);
    y += 4.5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(15, 23, 42);
    const lines = pdf.splitTextToSize(value, pw - ml * 2);
    pdf.text(lines, ml, y);
    y += lines.length * 5 + 3;
  };

  field("Title", documentTitle);
  if (documentDescription) field("Description", documentDescription);
  field("Source URL", documentUrl);
  field("Total Signers", String(signers.length));

  y += 4;

  // ── Signatures ──────────────────────────────────────────────
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(15, 23, 42);
  pdf.text("Signatures", ml, y);
  y += 5;
  pdf.setDrawColor(226, 232, 240);
  pdf.line(ml, y, pw - ml, y);
  y += 8;

  for (let i = 0; i < signers.length; i++) {
    const s = signers[i];
    const boxH = 58;

    if (y + boxH > ph - 20) {
      pdf.addPage();
      y = ml + 6;
    }

    // Box background
    pdf.setFillColor(240, 253, 250);
    pdf.setDrawColor(167, 243, 208);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(ml, y - 3, pw - ml * 2, boxH, 2.5, 2.5, "FD");

    // Number badge
    pdf.setFillColor(13, 148, 136);
    pdf.circle(ml + 6, y + 5, 4.5, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(255, 255, 255);
    pdf.text(String(i + 1), ml + 6, y + 7, { align: "center" });

    // Signer info
    const ix = ml + 14;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(15, 23, 42);
    pdf.text(s.user_name || "Unknown Signer", ix, y + 5);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(71, 85, 105);
    pdf.text(`Role: ${s.user_role}   Email: ${s.user_email || "—"}`, ix, y + 12);
    pdf.text(
      `Signed: ${new Date(s.signed_at).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}`,
      ix, y + 19,
    );
    if (s.notes) {
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(7.5);
      pdf.setTextColor(100, 116, 139);
      const noteLines = pdf.splitTextToSize(`Note: ${s.notes}`, 90);
      pdf.text(noteLines, ix, y + 27);
    }

    // Signature image — right side
    const imgBase64 = await loadImageAsBase64(s.signature_url);
    const imgX = pw - ml - 55;
    const imgY = y + 4;
    const imgW = 52;
    const imgH = 26;

    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(203, 213, 225);
    pdf.roundedRect(imgX - 2, imgY - 1, imgW + 4, imgH + 6, 1.5, 1.5, "FD");

    if (imgBase64) {
      pdf.addImage(imgBase64, "PNG", imgX, imgY, imgW, imgH);
    } else {
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(7);
      pdf.setTextColor(148, 163, 184);
      pdf.text("[Signature image unavailable]", imgX + imgW / 2, imgY + imgH / 2, { align: "center" });
    }

    // Dashed line + label
    pdf.setDrawColor(148, 163, 184);
    pdf.setLineDashPattern([0.8, 0.8], 0);
    pdf.line(imgX - 2, imgY + imgH + 2, imgX + imgW + 2, imgY + imgH + 2);
    pdf.setLineDashPattern([], 0);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(148, 163, 184);
    pdf.text("Authorised Signature", imgX + imgW / 2, imgY + imgH + 6, { align: "center" });

    y += boxH + 6;
  }

  // ── Footer ──────────────────────────────────────────────────
  const fy = ph - 12;
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.3);
  pdf.line(ml, fy - 4, pw - ml, fy - 4);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(148, 163, 184);
  pdf.text(
    `${hospitalName}  ·  Document Signing Certificate  ·  ${certDate}`,
    pw / 2, fy, { align: "center" },
  );

  const safeName = documentTitle.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").toLowerCase();
  pdf.save(`signing-certificate-${safeName}.pdf`);
}
