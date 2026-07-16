// types/clientCompany.types.ts — external companies using one of the org's
// products; each has a public feedback form link and IT supporter accounts.

export interface ClientCompany {
  id: string
  projectId: string
  name: string
  contactEmail: string | null
  feedbackToken: string | null
  supporterCount: number
  createdAt: string
}

export interface Supporter {
  id: string
  firstName: string
  lastName: string | null
  name: string
  email: string
  // Leads can assign incoming queue items to other supporters in the company.
  isSupportLead: boolean
  createdAt: string
  lastSeenAt: string | null
}

export interface CreateClientCompanyPayload {
  projectId: string
  name: string
  contactEmail?: string
}

export interface UpdateClientCompanyPayload {
  name?: string
  contactEmail?: string | null
}

export interface CreateSupporterPayload {
  firstName: string
  lastName: string
  email: string
  password: string
  isSupportLead?: boolean
}
