import { redis } from "./redis";
import { prisma } from "./prisma";

const CACHE_TTL = 300; // 5 minutes — change in DB reflects site-wide within 5 min
const PREFIX = "siteconfig:";

// Canonical defaults — used when a key hasn't been written to DB yet
// and as the fallback if DB/Redis are unavailable
export const CONFIG_DEFAULTS: Record<string, string> = {
  trial_days: "14",
  price_solo_monthly: "999",
  price_team3_monthly: "1999",
  price_team5_monthly: "3000",
  price_per_seat_enterprise: "550",
  annual_free_months: "2",
  storage_limit_solo_gb: "10",
  storage_limit_team_gb: "20",
  contact_email: "hello@estimatenepal.com",
  contact_whatsapp: "+977XXXXXXXXX",
  whatsapp_message: "Hi, I am interested in NepaliEstimate. Please share pricing details.",
  maintenance_mode: "false",
  registration_enabled: "true",
  site_announcement: "",
};

// Human-readable descriptions for the admin settings UI
export const CONFIG_DESCRIPTIONS: Record<string, string> = {
  trial_days: "Number of days for free trial",
  price_solo_monthly: "Solo plan monthly price (NPR)",
  price_team3_monthly: "Team of 3 plan monthly price (NPR)",
  price_team5_monthly: "Team of 5 plan monthly price (NPR)",
  price_per_seat_enterprise: "Enterprise per-seat anchor price (NPR)",
  annual_free_months: "Free months when paying annually (e.g. 2 = pay 10 get 12)",
  storage_limit_solo_gb: "Solo plan storage limit in GB",
  storage_limit_team_gb: "Team plan storage limit in GB",
  contact_email: "Public support/sales email address",
  contact_whatsapp: "WhatsApp number with country code (e.g. +977XXXXXXXXX)",
  whatsapp_message: "Default pre-filled WhatsApp enquiry message",
  maintenance_mode: "Show maintenance page to all visitors (true/false)",
  registration_enabled: "Allow new user registrations (true/false)",
  site_announcement: "Banner shown to all visitors on every page (empty = hidden)",
};

export async function getConfig(key: string): Promise<string> {
  try {
    const cached = await redis.get(`${PREFIX}${key}`);
    if (cached !== null) return cached;
  } catch {
    // Redis unavailable — fall through to DB
  }

  const row = await prisma.siteConfig.findUnique({ where: { key } }).catch(() => null);
  const value = row?.value ?? CONFIG_DEFAULTS[key] ?? "";

  // Best-effort cache — don't fail the request if Redis is down
  redis.set(`${PREFIX}${key}`, value, "EX", CACHE_TTL).catch(() => {});
  return value;
}

export async function getConfigNum(key: string): Promise<number> {
  const val = await getConfig(key);
  const n = parseInt(val, 10);
  return isNaN(n) ? (parseInt(CONFIG_DEFAULTS[key] ?? "0", 10) || 0) : n;
}

export async function getConfigBool(key: string): Promise<boolean> {
  return (await getConfig(key)) === "true";
}

export async function setConfig(key: string, value: string): Promise<void> {
  await prisma.siteConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value, description: CONFIG_DESCRIPTIONS[key] },
  });
  // Bust cache immediately so the change is reflected within milliseconds
  await redis.del(`${PREFIX}${key}`).catch(() => {});
}

// Returns all known keys, merging DB values over defaults
export async function getAllConfigs(): Promise<Record<string, string>> {
  const rows = await prisma.siteConfig.findMany().catch(() => []);
  const result = { ...CONFIG_DEFAULTS };
  for (const row of rows) result[row.key] = row.value;
  return result;
}
