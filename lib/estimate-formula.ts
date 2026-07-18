/**
 * DUDBC markup-on-cost formula used throughout the estimate layer.
 * wastePct and markupPct are additive (not gross-margin).
 *
 * saleRate = baseRate * (1 + waste/100) * (1 + markup/100)
 *
 * Both the API route (estimate/route.ts) and the UI (EstimatingSheet.tsx) import
 * this so they cannot drift independently.
 */
export function computeEstimateLine(
  totalQuantity: number,
  rate: number,
  wastePct: number,
  markupPct: number,
  vatRate: number
) {
  const itemCost = totalQuantity * rate * (1 + wastePct / 100);
  const saleRate = rate * (1 + wastePct / 100) * (1 + markupPct / 100);
  const totalSale = totalQuantity * saleRate;
  const vatAmount = totalSale * (vatRate / 100);
  const totalWithVat = totalSale + vatAmount;
  return { itemCost, saleRate, totalSale, vatAmount, totalWithVat };
}
