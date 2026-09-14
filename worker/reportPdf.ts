import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { SalesReport } from "./report";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;

function pdfSafe(value: string) {
  return value.replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, "?");
}

function sek(amount: number) {
  return `${amount.toFixed(2).replace(".", ",")} kr`;
}

export async function reportToPdf(report: SalesReport, shopName: string) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.14, 0.09);
  const muted = rgb(0.36, 0.42, 0.34);
  const line = rgb(0.84, 0.88, 0.8);
  const band = rgb(0.86, 0.91, 0.83);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const ensure = (need: number) => {
    if (y - need < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const draw = (text: string, x: number, size: number, options?: { bold?: boolean; color?: ReturnType<typeof rgb> }) => {
    page.drawText(pdfSafe(text), {
      x,
      y,
      size,
      font: options?.bold ? bold : font,
      color: options?.color ?? ink,
    });
  };

  draw("Försäljningsrapport", MARGIN, 20, { bold: true });
  y -= 18;
  draw(shopName || "Kassa", MARGIN, 11, { color: muted });
  y -= 16;
  draw(`Period: ${report.from} - ${report.to}`, MARGIN, 11);
  y -= 14;
  draw(`Köp: ${report.orderCount}    Sålda artiklar: ${report.itemCount}    Totalsumma: ${sek(report.totalAmount)}`, MARGIN, 11);
  y -= 22;

  const colName = MARGIN;
  const colQty = 390;
  const colSum = 470;

  const header = () => {
    ensure(22);
    page.drawRectangle({ x: MARGIN, y: y - 4, width: PAGE_W - MARGIN * 2, height: 18, color: band });
    draw("Kategori / produkt", colName + 4, 10, { bold: true });
    draw("Antal", colQty, 10, { bold: true });
    draw("Summa", colSum, 10, { bold: true });
    y -= 22;
  };

  header();

  for (const category of report.categories) {
    ensure(20);
    page.drawRectangle({ x: MARGIN, y: y - 3, width: PAGE_W - MARGIN * 2, height: 16, color: band });
    draw(category.category, colName + 4, 10, { bold: true });
    draw(String(category.qty), colQty, 10, { bold: true });
    draw(sek(category.amount), colSum, 10, { bold: true });
    y -= 18;

    for (const product of category.products) {
      ensure(16);
      draw(product.name, colName + 12, 10);
      draw(String(product.qty), colQty, 10);
      draw(sek(product.amount), colSum, 10);
      page.drawLine({
        start: { x: MARGIN, y: y - 3 },
        end: { x: PAGE_W - MARGIN, y: y - 3 },
        thickness: 0.4,
        color: line,
      });
      y -= 16;
    }
    y -= 6;
  }

  ensure(24);
  page.drawLine({
    start: { x: MARGIN, y: y + 8 },
    end: { x: PAGE_W - MARGIN, y: y + 8 },
    thickness: 1,
    color: ink,
  });
  draw("Totalt", colName + 4, 11, { bold: true });
  draw(String(report.itemCount), colQty, 11, { bold: true });
  draw(sek(report.totalAmount), colSum, 11, { bold: true });

  return doc.save();
}
