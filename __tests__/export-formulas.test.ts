import {
  itemQtyFormula,
  groupQtyFormula,
  sanitizeCell,
  colLetter,
} from "../lib/export";

describe("itemQtyFormula", () => {
  it("L+B+H: multiplies all four columns", () => {
    expect(itemQtyFormula(5, true, true, true)).toBe("=C5*D5*E5*F5");
  });
  it("L+B: no height factor", () => {
    expect(itemQtyFormula(5, true, true, false)).toBe("=C5*D5*E5");
  });
  it("L+H without B: VERTICAL_WALL_AREA / area_x_h (skips col E)", () => {
    expect(itemQtyFormula(5, true, false, true)).toBe("=C5*D5*F5");
  });
  it("L only: COUNT / LINEAR items", () => {
    expect(itemQtyFormula(5, true, false, false)).toBe("=C5*D5");
  });
  it("no dimensions returns null (COUNT / AREA with stored qty)", () => {
    expect(itemQtyFormula(5, false, false, false)).toBeNull();
  });
  it("H only (no L) returns null — height alone cannot form a qty formula", () => {
    expect(itemQtyFormula(5, false, false, true)).toBeNull();
  });
  it("B only (no L) returns null", () => {
    expect(itemQtyFormula(5, false, true, false)).toBeNull();
  });
  it("uses correct row number in formula references", () => {
    expect(itemQtyFormula(42, true, true, true)).toBe("=C42*D42*E42*F42");
    expect(itemQtyFormula(1,  true, false, true)).toBe("=C1*D1*F1");
  });
});

describe("groupQtyFormula", () => {
  it("plain SUM when gm=1 and cf=1", () => {
    expect(groupQtyFormula(3, 6, "G", 1, 1)).toBe("=SUM(G3:G6)");
  });
  it("includes conversion factor when cf≠1", () => {
    // 0.3048 ft→m; toFixed(9) = "0.304800000"
    expect(groupQtyFormula(3, 6, "G", 1, 0.3048)).toBe("=SUM(G3:G6)*0.304800000");
  });
  it("includes group multiplier when gm≠1", () => {
    expect(groupQtyFormula(3, 6, "G", 2, 1)).toBe("=SUM(G3:G6)*2");
  });
  it("includes both gm and cf in correct order (gm first)", () => {
    expect(groupQtyFormula(3, 6, "G", 3, 0.3048)).toBe("=SUM(G3:G6)*3*0.304800000");
  });
  it("works with Govt format D column", () => {
    expect(groupQtyFormula(10, 13, "D", 1, 1)).toBe("=SUM(D10:D13)");
  });
  it("Govt format with groupMultiplier and cf", () => {
    expect(groupQtyFormula(10, 13, "D", 2, 0.3048)).toBe("=SUM(D10:D13)*2*0.304800000");
  });
  it("single-item group (first == last)", () => {
    expect(groupQtyFormula(7, 7, "G", 1, 1)).toBe("=SUM(G7:G7)");
  });
});

describe("sanitizeCell", () => {
  it("prefixes = with a space to prevent formula injection", () => {
    expect(sanitizeCell("=EVIL()")).toBe(" =EVIL()");
  });
  it("prefixes + with a space", () => {
    expect(sanitizeCell("+cmd")).toBe(" +cmd");
  });
  it("prefixes - with a space", () => {
    expect(sanitizeCell("-1")).toBe(" -1");
  });
  it("prefixes @ with a space", () => {
    expect(sanitizeCell("@user")).toBe(" @user");
  });
  it("leaves normal strings unchanged", () => {
    expect(sanitizeCell("Brick Masonry")).toBe("Brick Masonry");
    expect(sanitizeCell("1.2.3 Foundation")).toBe("1.2.3 Foundation");
  });
  it("leaves empty string unchanged", () => {
    expect(sanitizeCell("")).toBe("");
  });
});

describe("colLetter", () => {
  it("converts single-letter columns", () => {
    expect(colLetter(1)).toBe("A");
    expect(colLetter(26)).toBe("Z");
  });
  it("converts two-letter columns", () => {
    expect(colLetter(27)).toBe("AA");
    expect(colLetter(28)).toBe("AB");
    expect(colLetter(52)).toBe("AZ");
    expect(colLetter(53)).toBe("BA");
  });
  it("converts the standard fixed columns 1–8", () => {
    const expected = ["A","B","C","D","E","F","G","H"];
    expected.forEach((letter, i) => expect(colLetter(i + 1)).toBe(letter));
  });
});
