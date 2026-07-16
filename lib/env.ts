// H4: Startup env validation — call once at server boot to get a clear error
// instead of a cryptic runtime failure deep in a request handler.
const REQUIRED_VARS = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "EMAIL_FROM",
  "RESEND_API_KEY",
  "CRON_SECRET",
  "REDIS_URL",
  "RESEND_WEBHOOK_SECRET",
] as const;

export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n` +
        missing.map((k) => `  • ${k}`).join("\n") +
        `\nCheck your .env.local or DigitalOcean App Platform environment settings.`
    );
  }
}
