/**
 * DUDBC markup-on-cost formula used throughout the estimate layer.
 * wastePct and markupPct are additive (not gross-margin).
 *
 * saleRate = baseRate * (1 + waste/100) * (1 + markup/100)
 * TDS is deducted on totalSale (pre-VAT) — consistent with the BOQ layer.
 *
 * Both the API route (estimate/route.ts) and the UI (EstimatingSheet.tsx) import
 * this so they cannot drift independently.
 */
export function computeEstimateLine(
  totalQuantity: number,
  rate: number,
  wastePct: number,
  markupPct: number,
  vatRate: number,
  tdsRate = 0,
) {
  const itemCost = totalQuantity * rate * (1 + wastePct / 100);
  const saleRate = rate * (1 + wastePct / 100) * (1 + markupPct / 100);
  const totalSale = totalQuantity * saleRate;
  const tdsAmount = totalSale * (tdsRate / 100);
  const vatAmount = totalSale * (vatRate / 100);
  const totalWithVat = totalSale + vatAmount;
  const netPayable = totalWithVat - tdsAmount;
  return { itemCost, saleRate, totalSale, tdsAmount, vatAmount, totalWithVat, netPayable };
}
