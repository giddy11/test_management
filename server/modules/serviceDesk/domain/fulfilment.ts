// modules/serviceDesk/domain/fulfilment.ts
// How a catalog item gets fulfilled, and the webhook connector's protocol.
// Pure — signing, retry timing and response handling are tested on their own.
//
//   manual   a person in IT does it (Phase 1)
//   webhook  TestMate sends the request to a connector (Power Automate, Logic
//            Apps, n8n…) that provisions it, then reports back
//   deflect  the item points people at a self-service link (e.g. the identity
//            provider's password reset); using it records the request as
//            fulfilled by self-service
//
// The webhook protocol, as a connector sees it:
//   POST <connector URL>
//     X-TestMate-Event:     service_request.fulfil | ping
//     X-TestMate-Delivery:  <run id>  (idempotency key — the same on a retry)
//     X-TestMate-Timestamp: <unix seconds>
//     X-TestMate-Signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>
//     body: { event, deliveryId, request: {...}, callbackUrl }
//   The connector either answers straight away with
//     { "status": "succeeded" | "failed", "note": "..." }
//   or answers 2xx without a status and later POSTs that same JSON to
//   callbackUrl (one-time; valid until the run finishes).
import { createHmac } from "crypto";
import { z } from "zod";

export const FULFILMENT_TYPES = ["manual", "webhook", "deflect"] as const;
export type FulfilmentType = (typeof FULFILMENT_TYPES)[number];

export interface FulfilmentConfig {
  endpointId?: string | null; // webhook
  url?: string | null; // deflect
  label?: string | null; // deflect: the button's words
}

// Attempts after the first, minutes from the failure. Then it gives up.
export const RETRY_DELAYS_MINUTES = [1, 5, 15] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS_MINUTES.length + 1;
// A connector that accepted but never reported back is treated as failed.
export const CALLBACK_TIMEOUT_HOURS = 24;
export const DELIVERY_TIMEOUT_MS = 10_000;

export function signature(secret: string, timestamp: number, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

export const callbackBodySchema = z.object({
  status: z.enum(["succeeded", "failed"]),
  note: z.string().trim().max(2000).optional(),
  externalReference: z.string().trim().max(200).optional(),
});
export type CallbackBody = z.infer<typeof callbackBodySchema>;

export type DeliveryOutcome =
  | { kind: "succeeded"; note: string | null }
  | { kind: "failed"; error: string }
  | { kind: "accepted" } // 2xx, result to follow on the callback
  | { kind: "retry"; error: string };

// What a connector's HTTP response means. `status` 0 = no response at all
// (network error or timeout).
export function classifyResponse(status: number, body: unknown, networkError?: string): DeliveryOutcome {
  if (status === 0) return { kind: "retry", error: networkError || "No response from the connector" };
  if (status >= 200 && status < 300) {
    const parsed = callbackBodySchema.safeParse(body);
    if (parsed.success) {
      return parsed.data.status === "succeeded"
        ? { kind: "succeeded", note: parsed.data.note ?? null }
        : { kind: "failed", error: parsed.data.note || "The connector reported a failure" };
    }
    return { kind: "accepted" };
  }
  if (status === 408 || status === 429 || status >= 500) return { kind: "retry", error: `The connector answered ${status}` };
  return { kind: "failed", error: `The connector refused the request (${status})` };
}

// After `attempt` failed deliveries: when to try again, or null to give up.
export function nextAttemptAt(attempt: number, from: Date): Date | null {
  const delay = RETRY_DELAYS_MINUTES[attempt - 1];
  return delay === undefined ? null : new Date(from.getTime() + delay * 60_000);
}

// A connector URL: https (http only for a local connector in development),
// no credentials in it, never a private-network host in production. Unlike
// the AI server check, the query string is kept — Power Automate and Logic
// Apps put their signature there.
export function checkWebhookUrl(
  raw: string,
  allowPrivate: boolean,
  isPrivateHost: (host: string) => boolean
): { url: string; display: string } | { problem: string } {
  let u: URL;
  try {
    u = new URL(String(raw ?? "").trim());
  } catch {
    return { problem: "Enter the full address, starting with https://" };
  }
  if (u.username || u.password) return { problem: "Leave the user name and password out of the address" };
  if (u.protocol !== "https:" && !(allowPrivate && u.protocol === "http:")) {
    return { problem: "The address must start with https://" };
  }
  if (!allowPrivate && isPrivateHost(u.hostname)) {
    return { problem: "That address is on a private network and can't be reached" };
  }
  u.hash = "";
  return { url: u.toString(), display: `${u.origin}${u.pathname}`.slice(0, 300) };
}

// A self-service link is shown to every requester, so it must be a plain
// public https address.
export function checkDeflectUrl(raw: string): { url: string } | { problem: string } {
  try {
    const u = new URL(String(raw ?? "").trim());
    if (u.protocol !== "https:") return { problem: "The self-service link must start with https://" };
    return { url: u.toString() };
  } catch {
    return { problem: "Enter the full self-service address, starting with https://" };
  }
}
