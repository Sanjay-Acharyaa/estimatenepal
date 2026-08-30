import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { decryptWebhookSecret } from "@/lib/webhook-crypto";

export type WebhookEvent = "bid.submitted" | "tender.awarded" | "contract.signed" | "snag.raised";

interface DispatchOptions {
  orgId: string | null | undefined;
  event: WebhookEvent;
  data: Record<string, unknown>;
}

export function dispatchWebhook(options: DispatchOptions): void {
  if (!options.orgId) return;
  _dispatch({ orgId: options.orgId, event: options.event, data: options.data }).catch(() => undefined);
}

async function _dispatch({ orgId, event, data }: { orgId: string; event: WebhookEvent; data: Record<string, unknown> }) {
  const endpoints = await prisma.bidWebhookEndpoint.findMany({
    where: { org_id: orgId, enabled: true },
    select: { id: true, url: true, secret: true, events: true },
  });

  const active = endpoints.filter((ep) => ep.events.split(",").includes(event));
  if (active.length === 0) return;

  const timestamp = new Date().toISOString();
  const payload = { event, timestamp, data };
  const payloadStr = JSON.stringify(payload);

  await Promise.allSettled(active.map((ep) => _sendToEndpoint({ ep, payloadStr, event })));
}

async function _sendToEndpoint({
  ep,
  payloadStr,
  event,
}: {
  ep: { id: number; url: string; secret: string };
  payloadStr: string;
  event: WebhookEvent;
}) {
  const secret = decryptWebhookSecret(ep.secret);
  const signature = `sha256=${createHmac("sha256", secret).update(payloadStr).digest("hex")}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let success = false;

  try {
    const res = await fetch(ep.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-EstimateNepal-Signature": signature,
        "X-EstimateNepal-Event": event,
      },
      body: payloadStr,
      signal: controller.signal,
    });
    responseStatus = res.status;
    responseBody = (await res.text().catch(() => "")).slice(0, 2000);
    success = res.ok;
  } catch {
    responseBody = "Request failed or timed out.";
  } finally {
    clearTimeout(timeout);
  }

  await prisma.bidWebhookDelivery.create({
    data: {
      endpoint_id: ep.id,
      event_type: event,
      payload: payloadStr,
      status: success ? "SUCCESS" : "FAILED",
      attempt_count: 1,
      last_attempted_at: new Date(),
      response_status: responseStatus,
      response_body: responseBody,
    },
  }).catch(() => undefined);
}
