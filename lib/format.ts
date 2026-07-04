/**
 * Nepali number formatting utilities.
 * Uses South Asian grouping: last 3 digits, then pairs of 2 going left.
 * Example: 1,25,00,000 (one crore twenty-five lakh)
 */

function nepalGroup(absInt: number): string {
  const str = Math.round(absInt).toString();
  if (str.length <= 3) return str;
  const last3 = str.slice(-3);
  const remaining = str.slice(0, -3);
  const groups: string[] = [];
  let i = remaining.length;
  while (i > 0) {
    const start = Math.max(0, i - 2);
    groups.unshift(remaining.slice(start, i));
    i = start;
  }
  return groups.join(",") + "," + last3;
}

/** Full NPR amount with South Asian grouping. No decimals. */
export function fmtNPR(amount: number): string {
  if (!isFinite(amount)) return "NPR 0";
  const neg = amount < 0 ? "-" : "";
  return neg + "NPR " + nepalGroup(Math.abs(amount));
}

/** Full NPR amount with fixed decimal places. Used in BOQ/export tables. */
export function fmtNPRDecimal(amount: number, decimals = 2): string {
  if (!isFinite(amount)) return "NPR 0." + "0".repeat(decimals);
  const neg = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const [intPart, decPart = ""] = abs.toFixed(decimals).split(".");
  const intStr = parseInt(intPart, 10);
  return neg + "NPR " + nepalGroup(intStr) + (decimals > 0 ? "." + decPart.padEnd(decimals, "0") : "");
}

/** Compact display: 1.25 Cr / 12.5 L / NPR 1,500. Used in cards and summaries. */
export function fmtNPRCompact(amount: number): string {
  if (!isFinite(amount)) return "NPR 0";
  const neg = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  if (abs >= 10_000_000) return neg + "NPR " + (abs / 10_000_000).toFixed(2) + " Cr";
  if (abs >= 100_000)    return neg + "NPR " + (abs / 100_000).toFixed(2) + " L";
  return neg + "NPR " + nepalGroup(abs);
}

/** Plain number with South Asian grouping, no currency prefix. Used in tables. */
export function fmtNum(amount: number, decimals = 2): string {
  if (!isFinite(amount)) return "0." + "0".repeat(decimals);
  const neg = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const [intPart, decPart = ""] = abs.toFixed(decimals).split(".");
  return neg + nepalGroup(parseInt(intPart, 10)) + (decimals > 0 ? "." + decPart.padEnd(decimals, "0") : "");
}
