import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function safePdfText(input: unknown) {
  const s = String(input ?? "");
  // pdf-lib StandardFonts are not full-Unicode; strip characters that can crash drawText/width calculations.
  // Keep: tabs/newlines/carriage returns + basic Latin + Latin-1 supplement.
  return s.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
}

function decodeDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  if (!dataUrl.startsWith("data:")) return null;
  const [meta, payload] = dataUrl.split(",", 2);
  if (!meta || !payload) return null;
  const mime = meta.slice(5).split(";")[0] ?? "";
  if (!/;base64$/i.test(meta)) return null;
  try {
    const buf = Buffer.from(payload, "base64");
    return { mime, bytes: new Uint8Array(buf) };
  } catch {
    return null;
  }
}

function formatDate(date: Date | string | null) {
  if (!date) return "—";
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

const currencyFormatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
});

function money(n: number) {
  return currencyFormatter.format(n);
}

function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  const safe = safePdfText(text);
  if (!safe) return [];
  const words = safe.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const lineWithWord = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(lineWithWord, fontSize);
    if (width < maxWidth) {
      currentLine = lineWithWord;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

export async function GET(
  req: NextRequest, 
  { params }: { params: Promise<{ tenantId: string; invoiceId: string }> }
) {
  try {
    const session = await auth();
    const { tenantId, invoiceId } = await params;

    // SECURITY: Ensure the logged-in user belongs to the tenant they are requesting
    // Master Admin can see anything, otherwise tenantId must match session
    if (!session?.user || (!session.user.isMasterAdmin && session.user.tenantId !== tenantId)) {
      return NextResponse.json({ error: "Unauthorized access to this studio's data" }, { status: 403 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        client: true,
        lineItems: true,
        tenant: true,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const tenant = invoice.tenant;

    // Update viewedAt if it's the first time
    if (!invoice.viewedAt && session.user.role === 'CLIENT') {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { viewedAt: new Date() }
      });
    }

    // PDF Generation
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]); // A4
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const margin = 50;
    const pageW = 595.28;
    const pageH = 841.89;
    let y = pageH - margin;

    // Header Info (Tenant)
    const drawText = (text: string, x: number, yPos: number, size: number, f = font, color = rgb(0, 0, 0)) => {
      const safe = safePdfText(text);
      if (!safe) return;
      page.drawText(safe, { x, y: yPos, size, font: f, color });
    };

    // Use invoice-specific logo if available, fallback to studio logo
    const logoUrl = tenant.invoiceLogoUrl || tenant.logoUrl;
    let logoHeight = 0;
    if (logoUrl) {
      const decoded = decodeDataUrl(logoUrl);
      if (decoded) {
        try {
          const img = /png/i.test(decoded.mime) ? await doc.embedPng(decoded.bytes) : await doc.embedJpg(decoded.bytes);
          const maxH = 50;
          const scale = maxH / img.height;
          logoHeight = maxH;
          page.drawImage(img, { x: margin, y: y - maxH, width: img.width * scale, height: maxH });
        } catch (e) {}
      }
    }

    // Studio Info (Left Aligned under or next to logo)
    let infoY = logoHeight > 0 ? y - logoHeight - 15 : y;
    const drawInfo = (text: string, size: number, isBold = false, color = rgb(0,0,0)) => {
      if (!text) return;
      drawText(text, margin, infoY - size, size, isBold ? bold : font, color);
      infoY -= size + 5;
    };

    drawInfo(tenant.name, 12, true);
    if (tenant.abn) {
      drawInfo(`ABN: ${tenant.abn}`, 9, false, rgb(0.4, 0.4, 0.4));
    }
    drawInfo(tenant.contactEmail || "", 9, false, rgb(0.3, 0.3, 0.3));
    drawInfo(tenant.contactPhone || "", 9, false, rgb(0.3, 0.3, 0.3));
    
    // Add physical address if available
    if (tenant.address) {
      const addr = `${tenant.address}${tenant.city ? `, ${tenant.city}` : ""}${tenant.postalCode ? ` ${tenant.postalCode}` : ""}`;
      drawInfo(addr, 9, false, rgb(0.3, 0.3, 0.3));
    }

    // Right side meta info (Invoice #, Date, Due Date)
    let rightY = y;
    const drawRight = (text: string, size: number, isBold = false, color = rgb(0,0,0)) => {
      const f = isBold ? bold : font;
      const safe = safePdfText(text);
      if (!safe) return;
      const w = f.widthOfTextAtSize(safe, size);
      drawText(safe, pageW - margin - w, rightY - size, size, f, color);
      rightY -= size + 5;
    };

    rightY -= 5;
    drawRight(`Invoice #${invoice.number}`, 14, true);
    rightY -= 10;
    drawRight(`Date: ${formatDate(invoice.issuedAt)}`, 10);
    drawRight(`Due Date: ${formatDate(invoice.dueAt)}`, 10, true, rgb(0.8, 0.2, 0.2));

    y = Math.min(infoY - 40, rightY - 40);

    // Invoice Title
    drawText("TAX INVOICE", margin, y, 28, bold);
    
    y -= 50;

    // Bill To & Totals Summary Row
    const billToY = y;
    drawText("INVOICE TO", margin, y, 10, bold, rgb(0.5, 0.5, 0.5));
    y -= 18;
    const recipientName =
      (invoice as any).invoiceRecipientName ||
      invoice.client?.businessName ||
      invoice.client?.name ||
      "One-Time Client";
    drawText(recipientName, margin, y, 14, bold);
    y -= 16;
    if (invoice.client?.businessName && invoice.client?.name) {
      drawText(invoice.client.name, margin, y, 11);
      y -= 14;
    }
    drawText(invoice.address || "", margin, y, 11, font, rgb(0.2, 0.2, 0.2));

    // Summary box on the right
    const summaryW = 180;
    const summaryX = pageW - margin - summaryW;
    const summaryH = 60;
    page.drawRectangle({
      x: summaryX,
      y: billToY - summaryH + 10,
      width: summaryW,
      height: summaryH,
      color: rgb(0.98, 0.98, 0.98),
      borderColor: rgb(0.9, 0.9, 0.9),
      borderWidth: 1
    });

    const drawSummaryLine = (label: string, value: string, posY: number, isBold = false) => {
      const safeLabel = safePdfText(label);
      const safeValue = safePdfText(value);
      drawText(safeLabel, summaryX + 15, posY, 9, isBold ? bold : font, rgb(0.4, 0.4, 0.4));
      const valW = (isBold ? bold : font).widthOfTextAtSize(safeValue || "—", 11);
      drawText(safeValue, pageW - margin - 15 - valW, posY, 11, isBold ? bold : font);
    };

    const subtotal = invoice.lineItems.reduce((acc, item) => acc + (Number(item.quantity) * Number(item.unitPrice)), 0);
    const discount = Number(invoice.discount);
    const taxRate = Number(invoice.taxRate);
    const amountAfterDiscount = Math.max(0, subtotal - discount);
    
    let taxAmount = 0;
    let total = 0;
    
    // Check if the tenant uses tax inclusive pricing (standard in AU)
    const isTaxInclusive = (invoice.tenant as any).taxInclusive ?? true;

    if (isTaxInclusive) {
      total = amountAfterDiscount;
      taxAmount = total * (taxRate / (1 + taxRate));
    } else {
      taxAmount = amountAfterDiscount * taxRate;
      total = amountAfterDiscount + taxAmount;
    }

    drawSummaryLine("TOTAL DUE", money(total), billToY - 25, true);
    drawSummaryLine("DUE BY", formatDate(invoice.dueAt), billToY - 42, false);

    y = Math.min(y, billToY - summaryH) - 40;

    // Line Items Table
    page.drawRectangle({ x: margin, y: y - 22, width: pageW - margin * 2, height: 22, color: rgb(0.96, 0.96, 0.96) });
    const tableHeaderY = y - 15;
    drawText("DESCRIPTION", margin + 10, tableHeaderY, 9, bold, rgb(0.3, 0.3, 0.3));
    drawText("QTY", margin + 350, tableHeaderY, 9, bold, rgb(0.3, 0.3, 0.3));
    drawText("UNIT PRICE", margin + 400, tableHeaderY, 9, bold, rgb(0.3, 0.3, 0.3));
    drawText("TOTAL", margin + 480, tableHeaderY, 9, bold, rgb(0.3, 0.3, 0.3));

    y -= 22;
    invoice.lineItems.forEach((item) => {
      const lineTotal = Number(item.quantity) * Number(item.unitPrice);
      y -= 25;
      drawText(item.description, margin + 10, y, 10);
      drawText(String(item.quantity), margin + 350, y, 10);
      drawText(money(Number(item.unitPrice)), margin + 400, y, 10);
      drawText(money(lineTotal), margin + 480, y, 10, bold);
      
      page.drawLine({
        start: { x: margin, y: y - 8 },
        end: { x: pageW - margin, y: y - 8 },
        thickness: 0.5,
        color: rgb(0.9, 0.9, 0.9)
      });
    });

    y -= 40;

    // Totals Section
    const drawTotalLine = (label: string, value: string, isBold = false) => {
      const f = isBold ? bold : font;
      const safeLabel = safePdfText(label);
      const safeValue = safePdfText(value);
      drawText(safeLabel, margin + 350, y, 10, isBold ? bold : font, rgb(0.4, 0.4, 0.4));
      const valW = f.widthOfTextAtSize(safeValue || "—", 11);
      drawText(safeValue, pageW - margin - valW, y, 11, f);
      y -= 20;
    };

    const taxLabel = tenant.taxLabel || "GST";
    const taxRatePercent = (taxRate * 100).toFixed(0);

    drawTotalLine("SUBTOTAL", money(subtotal));
    if (discount > 0) drawTotalLine("DISCOUNT", `-${money(discount)}`);
    
    if (isTaxInclusive) {
      drawTotalLine(`INCLUDES ${taxLabel} (${taxRatePercent}%)`, money(taxAmount));
    } else {
      drawTotalLine(`${taxLabel} (${taxRatePercent}%)`, money(taxAmount));
    }
    
    y -= 5;
    page.drawLine({ start: { x: margin + 350, y: y + 10 }, end: { x: pageW - margin, y: y + 10 }, thickness: 1, color: rgb(0, 0, 0) });
    drawTotalLine("TOTAL DUE", money(total), true);

    // Payment Info & Terms
    y -= 40;
    
    // Bank Details Section
    let bankDetailsToUse = invoice.paymentTerms;
    if (!bankDetailsToUse && tenant.accountName) {
      bankDetailsToUse = `Account Name: ${tenant.accountName}\nBSB: ${tenant.bsb || "—"}  Account: ${tenant.accountNumber || "—"}`;
    }
    
    if (bankDetailsToUse) {
      drawText("PAYMENT INFORMATION", margin, y, 10, bold, rgb(0.5, 0.5, 0.5));
      y -= 15;
      const lines = safePdfText(bankDetailsToUse).split("\n");
      lines.forEach(line => {
        drawText(line, margin, y, 9, font, rgb(0.2, 0.2, 0.2));
        y -= 12;
      });
      y -= 20;
    }

    // Invoice Terms Section (Tenant Global Terms)
    const termsToUse = invoice.invoiceTerms || tenant.invoiceTerms;
    if (termsToUse) {
      drawText("TERMS & CONDITIONS", margin, y, 10, bold, rgb(0.5, 0.5, 0.5));
      y -= 15;
      const termsLines = wrapText(safePdfText(termsToUse), pageW - margin * 2, font, 8);
      termsLines.forEach(line => {
        if (y < margin + 40) { // Basic page overflow check
          y = pageH - margin;
        }
        drawText(line, margin, y, 8, font, rgb(0.3, 0.3, 0.3));
        y -= 11;
      });
    }

    // Client Notes if present
    if (invoice.clientNotes) {
      y -= 20;
      drawText("NOTES", margin, y, 10, bold, rgb(0.5, 0.5, 0.5));
      y -= 15;
      const noteLines = wrapText(safePdfText(invoice.clientNotes), pageW - margin * 2, font, 9);
      noteLines.forEach(line => {
        drawText(line, margin, y, 9);
        y -= 12;
      });
    }

    // Final Save
    const bytes = await doc.save();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Invoice-${invoice.number}.pdf"`
      }
    });

  } catch (error: any) {
    console.error("PDF GEN ERROR:", error);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}

