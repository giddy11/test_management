// modules/ai/domain/aiErrors.ts
// Turning provider failures into messages a non-technical user can act on.
//
// AiProviderError (infrastructure) says WHAT went wrong at the vendor, in seven
// kinds. AiRequestError (here) is what the client sees: an AppError whose
// `data.reason` lets the UI branch (e.g. show "add a key" for no_key) without
// parsing text. The vendor's own message goes to the server log only.
import { AppError } from "../../../shared/errors/AppError";
import {
  AI_PROVIDER_LABELS,
  AiProviderError,
  messageOf,
  type AiErrorKind,
  type AiGenerateResult,
  type AiProviderId,
} from "../../../infrastructure/ai/aiProvider";

export type AiFailureReason =
  | "no_key"
  | "no_credits"
  | "key_rejected"
  | "provider_account"
  | "model_rejected"
  | "busy"
  | "unreachable"
  | "refused"
  | "bad_output";

export type AiKeySource = "user" | "organization";

export class AiRequestError extends AppError {
  readonly reason: AiFailureReason;
  // Provider's status and raw message — logs only, never serialised.
  readonly provider?: { status?: number; message: string };

  constructor(
    message: string,
    statusCode: number,
    reason: AiFailureReason,
    provider?: { status?: number; message: string }
  ) {
    // AppError is JS, so TS infers its `data` default (null) as the param type;
    // the error handler forwards any object as-is.
    super(message, statusCode, [], { reason } as unknown as null);
    this.name = "AiRequestError";
    this.reason = reason;
    this.provider = provider;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// Failures that persist until whoever owns the key acts (adds a key, tops up,
// fixes the account, picks another model). Retrying won't help.
export const NEEDS_PAYER_ACTION: ReadonlySet<AiFailureReason> = new Set([
  "no_key",
  "no_credits",
  "key_rejected",
  "provider_account",
  "model_rejected",
]);

export const noKeyError = () =>
  new AiRequestError("AI is not set up yet. Add an API key in Settings to use it.", 503, "no_key");

// A reply came back but can't be used (unparseable, or failed validation
// twice). Carries the provider result so its tokens are still logged, then the
// credits are refunded like any other failure.
export class UnusableReply extends Error {
  constructor(
    public readonly result: AiGenerateResult,
    public readonly errorKind: string,
    public readonly error: AiRequestError
  ) {
    super(error.message);
    this.name = "UnusableReply";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface FailureContext {
  provider: AiProviderId;
  model: string;
  source: AiKeySource;
}

function whoseKey(source: AiKeySource): string {
  return source === "user" ? "your" : "your organisation's";
}

export function toRequestError(err: unknown, ctx: FailureContext): AiRequestError {
  if (err instanceof AiRequestError) return err;
  if (err instanceof UnusableReply) return err.error;

  const label = AI_PROVIDER_LABELS[ctx.provider];
  const whose = whoseKey(ctx.source);
  const kind: AiErrorKind = err instanceof AiProviderError ? err.kind : "unavailable";
  const provider = {
    status: err instanceof AiProviderError ? err.status : undefined,
    message: (err instanceof AiProviderError ? err.detail : messageOf(err)).slice(0, 600),
  };

  switch (kind) {
    case "auth":
      return new AiRequestError(
        `${label} rejected ${whose} API key. It may have been revoked or run out of credit.`,
        502,
        "key_rejected",
        provider
      );
    case "account":
      return new AiRequestError(
        `${label} refused this because of the account behind ${whose} API key: the model "${ctx.model}" ` +
          `may need a subscription or a higher plan, or the quota or balance has run out. ` +
          `Check the account with ${label}, or choose another model.`,
        502,
        "provider_account",
        provider
      );
    case "rate_limit":
      return new AiRequestError(
        `${label} is limiting requests on ${whose} API key right now. Try again in a minute.`,
        503,
        "busy",
        provider
      );
    case "invalid_request":
      return new AiRequestError(
        `${label} could not run this with the model "${ctx.model}". Choose another model in the AI settings.`,
        502,
        "model_rejected",
        provider
      );
    case "refused":
      return new AiRequestError("The AI declined to respond to this content.", 422, "refused", provider);
    case "truncated":
      return new AiRequestError(
        "The AI's answer was cut off before it finished. Try again.",
        502,
        "bad_output",
        provider
      );
    default:
      return new AiRequestError(`${label} did not respond. Try again in a moment.`, 502, "unreachable", provider);
  }
}

export function unexpectedFormatMessage(model: string): string {
  return (
    `The AI returned an answer in an unexpected format. Try again, or choose another model in the AI settings: ` +
    `"${model}" may not be able to write this kind of draft.`
  );
}
