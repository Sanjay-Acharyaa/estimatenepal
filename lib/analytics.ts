import { prisma } from "./prisma";

export type AnalyticsEventName =
  | "user_login"
  | "project_created"
  | "pdf_export"
  | "excel_export"
  | "procurement_export"
  | "tender_export"
  | "mb_export"
  | "govt_boq_export"
  | "assembly_applied"
  | "drawing_uploaded"
  | "invite_sent"
  | "coupon_redeemed"
  | "rate_imported"
  | "share_link_created"
  | "takeoff_item_created";

/**
 * Fire-and-forget analytics event. Never throws, never blocks the calling request.
 * If DB is down, event is silently dropped — analytics must never degrade the app.
 */
export function trackEvent(
  event: AnalyticsEventName,
  data: { orgId?: string | null; userId?: string | null; meta?: Record<string, unknown> }
): void {
  prisma.analyticsEvent
    .create({
      data: {
        event,
        orgId: data.orgId ?? null,
        userId: data.userId ?? null,
        meta: (data.meta as any) ?? undefined,
      },
    })
    .catch(() => {});
}
