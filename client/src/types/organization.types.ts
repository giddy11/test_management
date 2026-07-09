// types/organization.types.ts
export interface OrganizationSummary {
  organizationId: string
  name: string
  ownerName: string
  ownerEmail: string
  userCount: number
  projectCount: number
  createdAt: string
}

export interface FetchOrganizationsParams {
  page?: number
  limit?: number
  search?: string
}
