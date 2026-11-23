// modules/emailLog/dto/emailLog.dto.ts
import type { EmailLogListRow } from "../repositories/emailLog.repository";

export interface EmailLogResponse {
  id: string;
  createdAt: string;
  to: string;
  subject: string;
  kind: string | null;
  status: string;
  // The provider responsible for the email, or null when none was chosen.
  provider: string | null;
  // True when the main provider failed and this one handled it.
  fallback: boolean;
  providerMessageId: string | null;
  note: string | null;
  organizationId: string | null;
  organizationName: string | null;
}

// There is no organisations table, so the name is the owner's company name. An
// organisation whose owner never set one still gets something readable.
function organizationNameOf(row: EmailLogListRow): string | null {
  if (!row.organizationId) return null;
  return row.organizationName || `Organization ${row.organizationId.slice(0, 8)}`;
}

export function toEmailLogResponse(row: EmailLogListRow): EmailLogResponse {
  return {
    id: row.id,
    createdAt: new Date(row.createdAt).toISOString(),
    to: row.toEmail,
    subject: row.subject,
    kind: row.kind,
    status: row.status,
    provider: row.provider,
    fallback: row.fallback,
    providerMessageId: row.providerMessageId,
    note: row.note,
    organizationId: row.organizationId,
    organizationName: organizationNameOf(row),
  };
}
