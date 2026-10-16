// modules/ai/domain/credits.ts
// The seam between AiService and credits. AiService charges BEFORE calling the
// provider and refunds on any failure; it only ever sees this interface.
import type { Actor } from "../../../shared/types/actor";
import type { AiFeature } from "./features";

export interface AiCharge {
  amount: number;
  // Safe to call more than once; never throws (failures are logged).
  refund(): Promise<void>;
}

export interface AiCreditCharger {
  // null = nothing charged (the feature is free, or credits are off).
  // Throws AiRequestError(402, "no_credits") when the balance can't cover it.
  charge(actor: Actor, feature: AiFeature, context: { projectId?: string | null }): Promise<AiCharge | null>;
  // null = no metering in this organisation (no prices set).
  statusFor(actor: Actor, feature?: AiFeature): Promise<{ balance: number; price: number } | null>;
}

// Every request free. Handy in tests, and for wiring without credits.
export const NO_CREDITS: AiCreditCharger = {
  charge: async () => null,
  statusFor: async () => null,
};

export const MAX_CREDIT_PRICE = 1000;
export const MAX_CREDIT_GRANT = 1_000_000;

// A usable price: a positive whole number. Anything else means free.
export function priceOf(prices: Record<string, unknown>, feature: string): number {
  const p = prices?.[feature];
  return typeof p === "number" && Number.isInteger(p) && p > 0 ? p : 0;
}

export function isMetered(prices: Record<string, unknown>): boolean {
  return Object.keys(prices ?? {}).some((feature) => priceOf(prices, feature) > 0);
}

export const credits = (n: number) => `${n} credit${Math.abs(n) === 1 ? "" : "s"}`;
