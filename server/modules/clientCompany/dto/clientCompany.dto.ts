// modules/clientCompany/dto/clientCompany.dto.ts
import type { ClientCompany } from "../entities/clientCompany.entity";

export interface ClientCompanyResponseDTO {
  id: string;
  projectId: string;
  name: string;
  contactEmail: string | null;
  feedbackToken: string | null;
  supporterCount: number;
  createdAt: Date;
}

export interface SupporterResponseDTO {
  id: string;
  firstName: string;
  lastName: string | null;
  name: string;
  email: string;
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
    supporterCount,
    createdAt: company.createdAt,
  };
}

export function toSupporterResponse(user: {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  createdAt: Date;
  lastSeenAt?: Date | null;
}): SupporterResponseDTO {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName ?? null,
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
    email: user.email,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt ?? null,
  };
}
