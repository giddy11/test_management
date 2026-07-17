// modules/clientCompany/dto/clientCompany.dto.ts
import type { ClientCompany } from "../entities/clientCompany.entity";

export interface ClientCompanyResponseDTO {
  id: string;
  projectId: string;
  name: string;
  contactEmail: string | null;
  feedbackToken: string | null;
  // Safe metadata only — the raw integration API key is never returned here,
  // only once from the generate/rotate call itself.
  integrationApiKeyLastFour: string | null;
  integrationApiKeyCreatedAt: Date | null;
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
    integrationApiKeyLastFour: company.integrationApiKeyLastFour ?? null,
    integrationApiKeyCreatedAt: company.integrationApiKeyCreatedAt ?? null,
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
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt ?? null,
  };
}
