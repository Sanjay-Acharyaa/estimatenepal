/**
 * Unit tests for coupon business logic.
 * Run with: npx jest __tests__/coupon.test.ts
 */

// ── Pure helpers extracted for testability ───────────────────────────────────

const COUPON_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCouponCode(bytes: Buffer): string {
  const part = (start: number, n: number) =>
    Array.from({ length: n }, (_, i) => COUPON_CHARS[bytes[start + i] % COUPON_CHARS.length]).join("");
  return `NE-${part(0, 4)}-${part(4, 4)}`;
}

function computeNewTrialEnd(currentTrialEndsAt: Date | null, durationDays: number, now: Date): Date {
  const base = currentTrialEndsAt && currentTrialEndsAt > now ? currentTrialEndsAt : now;
  return new Date(base.getTime() + durationDays * 24 * 60 * 60 * 1000);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("generateCouponCode", () => {
  it("produces the NE-XXXX-XXXX format", () => {
    const bytes = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]);
    const code = generateCouponCode(bytes);
    expect(code).toMatch(/^NE-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("uses only unambiguous characters (no 0, 1, I, O)", () => {
    // Test all possible byte values
    for (let b = 0; b < 256; b++) {
      const bytes = Buffer.alloc(8, b);
      const code = generateCouponCode(bytes);
      expect(code).not.toMatch(/[01IO]/);
    }
  });

  it("produces codes of exactly 11 characters", () => {
    const bytes = Buffer.from([10, 20, 30, 40, 50, 60, 70, 80]);
    expect(generateCouponCode(bytes)).toHaveLength(11);
  });

  it("different bytes produce different codes", () => {
    const a = generateCouponCode(Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]));
    const b = generateCouponCode(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(a).not.toBe(b);
  });
});

describe("computeNewTrialEnd", () => {
  const now = new Date("2026-06-18T00:00:00Z");

  it("extends from now when trial is already expired", () => {
    const expired = new Date("2026-06-15T00:00:00Z"); // 3 days ago
    const result = computeNewTrialEnd(expired, 7, now);
    const expected = new Date("2026-06-25T00:00:00Z"); // now + 7 days
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("extends from trial end when trial is still active", () => {
    const future = new Date("2026-06-20T00:00:00Z"); // 2 days from now
    const result = computeNewTrialEnd(future, 30, now);
    const expected = new Date("2026-07-20T00:00:00Z"); // future + 30 days
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("extends from now when trialEndsAt is null (no trial set)", () => {
    const result = computeNewTrialEnd(null, 7, now);
    const expected = new Date("2026-06-25T00:00:00Z");
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("stacks correctly when coupon matches exactly now", () => {
    const result = computeNewTrialEnd(now, 1, now);
    // now === currentTrialEndsAt is NOT > now, so base = now
    const expected = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
    expect(result.getTime()).toBe(expected.getTime());
  });
});
