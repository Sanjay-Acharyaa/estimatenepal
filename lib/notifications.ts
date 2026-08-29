import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { wrapEmailHtml } from "@/lib/email-template-constants";

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

// Dispatches an in-app notification and optionally an email for the given user.
// Looks up the message template from bid_notification_templates by eventKey.
// Silently swallows all errors — notification failure must never break the caller.
export async function dispatchUserNotification(
  userId: string,
  eventKey: string,
  vars: Record<string, string> = {}
): Promise<void> {
  try {
    const [template, pref, user] = await Promise.all([
      prisma.bidNotificationTemplate.findUnique({ where: { eventKey } }),
      prisma.notificationPreference.findUnique({
        where: { userId_eventKey: { userId, eventKey } },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, emailUnsubscribedAt: true, emailBouncedAt: true },
      }),
    ]);

    if (!user) return;

    const inAppEnabled = pref?.inAppEnabled ?? true;
    const emailEnabled = pref?.emailEnabled ?? true;
    const unsubscribed = !!user.emailUnsubscribedAt || !!user.emailBouncedAt;

    const rawBody = template?.emailBody ?? vars.message ?? eventKey;
    const message = renderTemplate(rawBody, vars);
    const link = vars.link ?? null;

    if (inAppEnabled) {
      await prisma.notification.create({
        data: { userId, type: eventKey, message, link },
      });
    }

    if (emailEnabled && !unsubscribed && template?.isActive) {
      const subject = renderTemplate(template.emailSubject, vars);
      const html = wrapEmailHtml(
        `<p style="color:#334155;font-size:15px;line-height:1.7;margin:0">${message.replace(/\n/g, "<br>")}</p>`
      );
      sendEmail({ to: user.email, subject, html }).catch(() => {});
    }
  } catch {
    // Intentional: notification failures must never surface to callers
  }
}
