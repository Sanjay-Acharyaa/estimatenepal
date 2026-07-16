// Server-only — imports Prisma. Do NOT import in "use client" components.
// For constants (TEMPLATE_TYPES, TEMPLATE_LABELS, etc.) import from lib/email-template-constants.ts instead.

import { prisma } from "@/lib/prisma";
import {
  TEMPLATE_TYPES,
  DEFAULT_SUBJECTS,
  DEFAULT_BODIES,
  wrapEmailHtml,
} from "@/lib/email-template-constants";

export type { TemplateType } from "@/lib/email-template-constants";
export { TEMPLATE_TYPES, DEFAULT_SUBJECTS, DEFAULT_BODIES };

export type TemplateFull = {
  emailType: string;
  subject: string;
  bodyHtml: string;
  updatedAt: Date | null;
  updatedBy: string | null;
  isCustom: boolean;
};

// Replace {{key}} placeholders with values and wrap in the full email HTML shell
export function renderTemplate(bodyHtml: string, vars: Record<string, string>): string {
  let html = bodyHtml;
  for (const [key, value] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return wrapEmailHtml(html);
}

// Load all templates: DB rows merged with defaults (DB wins on conflict)
export async function getTemplates(): Promise<TemplateFull[]> {
  const dbRows = await prisma.emailTemplate.findMany();
  const dbMap = new Map(dbRows.map((r) => [r.emailType, r]));

  return TEMPLATE_TYPES.map((type) => {
    const db = dbMap.get(type);
    return {
      emailType: type,
      subject: db?.subject ?? DEFAULT_SUBJECTS[type],
      bodyHtml: db?.bodyHtml ?? DEFAULT_BODIES[type],
      updatedAt: db?.updatedAt ?? null,
      updatedBy: db?.updatedBy ?? null,
      isCustom: !!db,
    };
  });
}
