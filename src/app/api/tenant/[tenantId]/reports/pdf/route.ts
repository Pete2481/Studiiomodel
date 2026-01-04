import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function parseIsoDate(iso: string | null) {
  if (!iso) return null;
  const parts = iso.split("-").map((p) => p.trim());
  if (parts.length !== 3) return null;
  const [yStr, mStr, dStr] = parts;
  const y = Number.parseInt(yStr, 10);
  const m = Number.parseInt(mStr, 10);
  const d = Number.parseInt(dStr, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function money(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function drawSectionTitle(page: any, bold: any, x: number, y: number, text: string) {
  page.drawText(text, { x, y, size: 12, font: bold, color: rgb(0.06, 0.08, 0.12) });
}

function drawBadge(page: any, font: any, x: number, y: number, text: string) {
  const size = 9;
  const padX = 8;
  const padY = 4;
  const textWidth = font.widthOfTextAtSize(text, size);
  const w = textWidth + padX * 2;
  const h = size + padY * 2;
  page.drawRectangle({ x, y: y - h, width: w, height: h, color: rgb(0.95, 0.97, 0.99) });
  page.drawText(text, { x: x + padX, y: y - h + padY + 1, size, font, color: rgb(0.25, 0.28, 0.35) });
  return w;
}

function drawCard(params: {
  page: any;
  font: any;
  bold: any;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  value: string;
  subtitle?: string;
  accent?: { r: number; g: number; b: number };
}) {
  const { page, font, bold, x, y, w, h, title, value, subtitle, accent } = params;
  const ay = y - h;
  page.drawRectangle({ x, y: ay, width: w, height: h, color: rgb(1, 1, 1), borderColor: rgb(0.9, 0.91, 0.93), borderWidth: 1 });
  if (accent) {
    page.drawRectangle({ x, y: y - 4, width: w, height: 4, color: rgb(accent.r, accent.g, accent.b) });
  }
  page.drawText(title.toUpperCase(), { x: x + 12, y: y - 18, size: 8, font: bold, color: rgb(0.55, 0.6, 0.68) });
  page.drawText(value, { x: x + 12, y: y - 42, size: 18, font: bold, color: rgb(0.06, 0.08, 0.12) });
  if (subtitle) {
    page.drawText(subtitle, { x: x + 12, y: y - 62, size: 9, font, color: rgb(0.35, 0.4, 0.48) });
  }
}

function drawBarChart(params: {
  page: any;
  font: any;
  bold: any;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  data: { label: string; value: number }[];
  color: { r: number; g: number; b: number };
  valueFormat?: (n: number) => string;
}) {
  const { page, font, bold, x, y, w, h, title, data, color, valueFormat } = params;
  page.drawRectangle({ x, y: y - h, width: w, height: h, color: rgb(1, 1, 1), borderColor: rgb(0.9, 0.91, 0.93), borderWidth: 1 });
  page.drawText(title, { x: x + 12, y: y - 18, size: 11, font: bold, color: rgb(0.06, 0.08, 0.12) });

  const innerX = x + 12;
  const innerY = y - 30;
  const innerW = w - 24;
  const innerH = h - 44;

  const max = Math.max(1, ...data.map((d) => d.value));
  const barCount = data.length;
  const gap = barCount <= 14 ? 6 : 3;
  const barW = Math.max(2, (innerW - gap * (barCount - 1)) / barCount);

  data.forEach((d, idx) => {
    const bh = (d.value / max) * innerH;
    const bx = innerX + idx * (barW + gap);
    const by = innerY - innerH;
    page.drawRectangle({
      x: bx,
      y: by,
      width: barW,
      height: bh,
      color: rgb(color.r, color.g, color.b),
    });
  });

  const labelCount = Math.min(barCount, 7);
  const step = Math.max(1, Math.floor(barCount / labelCount));
  for (let i = 0; i < barCount; i += step) {
    const d = data[i];
    const bx = innerX + i * (barW + gap);
    page.drawText(d.label, { x: bx, y: (y - h) + 6, size: 7, font, color: rgb(0.5, 0.54, 0.6) });
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const totalText = valueFormat ? valueFormat(total) : total.toFixed(0);
  page.drawText(totalText, { x: x + w - 12 - font.widthOfTextAtSize(totalText, 10), y: y - 18, size: 10, font: bold, color: rgb(0.25, 0.28, 0.35) });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { tenantId } = await params;
    const { searchParams } = new URL(req.url);
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");

    const from = parseIsoDate(fromStr);
    const toBase = parseIsoDate(toStr);
    if (!from || !toBase) return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
    const to = endOfDay(toBase);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, logoUrl: true, settings: true, brandColor: true }
    });
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const [invoices, galleries, bookings, services] = await Promise.all([
      prisma.invoice.findMany({
        where: { tenantId, issuedAt: { gte: from, lte: to }, deletedAt: null },
        include: { lineItems: true }
      }),
      prisma.gallery.findMany({
        where: { tenantId, deliveredAt: { gte: from, lte: to }, deletedAt: null }
      }),
      prisma.booking.findMany({
        where: { tenantId, startAt: { gte: from, lte: to }, deletedAt: null },
        include: { services: true }
      }),
      prisma.service.findMany({
        where: { tenantId, deletedAt: null }
      })
    ]);

    const salesTotal = invoices
      .filter(inv => inv.status !== 'DRAFT' && inv.status !== 'CANCELLED')
      .reduce((acc, inv) => {
        const subtotal = inv.lineItems.reduce((s, li) => s + (Number(li.quantity) * Number(li.unitPrice)), 0);
        return acc + subtotal - Number(inv.discount);
      }, 0);

    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const margin = 44;
    const pageW = 595.28;
    const pageH = 841.89;
    let y = pageH - margin;

    const brandHex = tenant.brandColor || "#10b981";
    const r = parseInt(brandHex.slice(1, 3), 16) / 255;
    const g = parseInt(brandHex.slice(3, 5), 16) / 255;
    const b = parseInt(brandHex.slice(5, 7), 16) / 255;
    const brandColor = { r, g, b };

    // Header
    page.drawRectangle({ x: 0, y: pageH - 90, width: pageW, height: 90, color: rgb(0.97, 0.98, 0.99) });
    page.drawRectangle({ x: 0, y: pageH - 90, width: pageW, height: 4, color: rgb(brandColor.r, brandColor.g, brandColor.b) });

    page.drawText("Performance Report", { x: margin, y: pageH - 48, size: 20, font: bold, color: rgb(0.06, 0.08, 0.12) });
    page.drawText(tenant.name, { x: margin, y: pageH - 70, size: 11, font: bold, color: rgb(0.25, 0.28, 0.35) });

    let bx = pageW - margin - 260;
    bx += drawBadge(page, font, bx, pageH - 40, `Range: ${fromStr} to ${toStr}`) + 10;
    drawBadge(page, font, bx, pageH - 40, `Generated: ${new Date().toISOString().slice(0, 10)}`);

    y = pageH - 130;
    drawSectionTitle(page, bold, margin, y, "Summary");
    y -= 20;

    const cardW = (pageW - margin * 2 - 16) / 2;
    const cardH = 78;
    drawCard({ page, font, bold, x: margin, y, w: cardW, h: cardH, title: "Total Revenue", value: money(salesTotal), accent: brandColor });
    drawCard({ page, font, bold, x: margin + cardW + 16, y, w: cardW, h: cardH, title: "New Bookings", value: String(bookings.length), accent: { r: 0.07, g: 0.64, b: 0.86 } });
    
    y -= cardH + 12;
    drawCard({ page, font, bold, x: margin, y, w: cardW, h: cardH, title: "Completed Shoots", value: String(galleries.length), accent: { r: 0.39, g: 0.4, b: 0.94 } });
    drawCard({ page, font, bold, x: margin + cardW + 16, y, w: cardW, h: cardH, title: "Invoices Issued", value: String(invoices.length), accent: { r: 0.93, g: 0.45, b: 0.14 } });

    // Simple Daily Chart Data
    const days: { label: string; value: number }[] = [];
    const curr = new Date(from);
    while (curr <= toBase) {
      const dStr = curr.getDate().toString();
      const val = invoices
        .filter(inv => inv.issuedAt && inv.issuedAt.getDate() === curr.getDate())
        .reduce((acc, inv) => acc + inv.lineItems.reduce((s, li) => s + (Number(li.quantity) * Number(li.unitPrice)), 0), 0);
      days.push({ label: dStr, value: val });
      curr.setDate(curr.getDate() + 1);
    }

    y -= cardH + 30;
    drawBarChart({
      page, font, bold, x: margin, y, w: pageW - margin * 2, h: 180,
      title: "Revenue Pulse (Daily)",
      data: days,
      color: brandColor,
      valueFormat: (n) => money(n)
    });

    const bytes = await doc.save();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Performance-Report-${fromStr}-to-${toStr}.pdf"`,
      },
    });
  } catch (error) {
    console.error("PDF REPORT ERROR:", error);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}

