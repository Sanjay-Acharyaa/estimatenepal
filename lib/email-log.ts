import { prisma } from "@/lib/prisma";

export async function logEmail(params: {
  orgId?: string | null;
  recipientEmail: string;
  recipientName: string;
  emailType: string;
  subject: string;
  status?: "sent" | "failed";
  errorMessage?: string;
  resendEmailId?: string | null; // L2: Resend email ID for delivery webhook tracking
}) {
  try {
    await prisma.emailLog.create({
      data: {
        orgId:          params.orgId ?? null,
        recipientEmail: params.recipientEmail,
        recipientName:  params.recipientName,
        emailType:      params.emailType,
        subject:        params.subject,
        status:         params.status ?? "sent",
        errorMessage:   params.errorMessage ?? null,
        resendEmailId:  params.resendEmailId ?? null,
      },
    });
  } catch (err) {
    console.error("[email-log] Failed to log email:", (err as Error).message);
  }
}
