// modules/clientCompany/dto/clientCompany.dto.ts
import type { ClientCompany } from "../entities/clientCompany.entity";

const { env } = require("../../../config/env");

export interface ClientCompanyResponseDTO {
  id: string;
  projectId: string;
  name: string;
  contactEmail: string | null;
  feedbackToken: string | null;
  // Ready-to-share public ticket-form link for this company — the frontend
  // origin plus /feedback/<feedbackToken>. null whenever feedbackToken is null
  // (form disabled), so callers don't have to assemble the URL themselves.
  feedbackUrl: string | null;
  autoAssignEnabled: boolean;
  supporterCount: number;
  createdAt: Date;
}

export interface SupporterResponseDTO {
  id: string;
  firstName: string;
  lastName: string | null;
  name: string;
  email: string;
  isSupportLead: boolean;
  // At most one true per company. Only a TestMate admin can change this
  // person's lead status or remove them — peer leads can't.
  isPrimarySupportLead: boolean;
  createdAt: Date;
  lastSeenAt: Date | null;
}

export function toClientCompanyResponse(
  company: ClientCompany,
  supporterCount = 0
): ClientCompanyResponseDTO {
  return {
    id: company.id,
    projectId: company.projectId,
    name: company.name,
    contactEmail: company.contactEmail ?? null,
    feedbackToken: company.feedbackToken ?? null,
    feedbackUrl: company.feedbackToken ? `${env.appUrl}/feedback/${company.feedbackToken}` : null,
    autoAssignEnabled: company.autoAssignEnabled ?? false,
    supporterCount,
    createdAt: company.createdAt,
  };
}

export function toSupporterResponse(user: {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  isSupportLead?: boolean;
  isPrimarySupportLead?: boolean;
  createdAt: Date;
  lastSeenAt?: Date | null;
}): SupporterResponseDTO {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName ?? null,
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
    email: user.email,
    isSupportLead: user.isSupportLead ?? false,
    isPrimarySupportLead: user.isPrimarySupportLead ?? false,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt ?? null,
  };
}
