// modules/clientCompany/validators/clientCompany.schema.ts
import { z } from "zod";

export const fetchClientCompaniesSchema = z.object({
  query: z.object({ projectId: z.string().uuid() }),
});

// The company's first IT supporter is created in the same call — same
// password rules as createSupporterSchema below — and becomes its primary
// lead automatically, since there's no one else yet to defer to.
export const createClientCompanySchema = z.object({
  body: z.object({
    projectId: z.string().uuid(),
    name: z.string().min(1).max(200),
    contactEmail: z.string().email().max(255).optional(),
    supporter: z.object({
      firstName: z.string().min(1).max(100),
      lastName: z.string().min(1).max(100),
      email: z.string().email(),
      password: z
        .string()
        .min(8)
        .max(64)
        .regex(/[A-Z]/, "Must contain an uppercase letter")
        .regex(/[0-9]/, "Must contain a number"),
    }),
  }),
});

export const updateClientCompanySchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      name: z.string().min(1).max(200).optional(),
      contactEmail: z.string().email().max(255).nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "At least one field must be provided",
    }),
});

export const clientCompanyIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const clientCompanyLinkSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ enabled: z.boolean() }),
});

// Self-service only — see clientCompany.routes.ts and
// ClientCompanyService.setAutoAssign.
export const setAutoAssignSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ enabled: z.boolean() }),
});

// Same password rules as user.schema.js createUserSchema.
export const createSupporterSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    email: z.string().email(),
    password: z
      .string()
      .min(8)
      .max(64)
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/[0-9]/, "Must contain a number"),
    // Leads can assign incoming queue items to other supporters in the company.
    isSupportLead: z.boolean().optional(),
  }),
});

// Server-to-server company provisioning — unauthenticated, so the caller
// identifies the target project directly instead of via a resolved key.
// Creates the ClientCompany record and its first IT support account (its
// primary lead) together, same as the in-app flow — but no password field:
// the partner's backend isn't a human choosing one, so one is generated
// server-side and emailed to the supporter via the usual invite.
export const integrationProvisionCompanySchema = z.object({
  body: z.object({
    projectId: z.string().uuid(),
    name: z.string().min(1).max(200),
    contactEmail: z.string().email().max(255).optional(),
    supporter: z.object({
      firstName: z.string().min(1).max(100),
      lastName: z.string().min(1).max(100),
      email: z.string().email(),
    }),
  }),
});

export const supporterParamSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
  }),
});

export const setSupporterLeadSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
  }),
  body: z.object({ isSupportLead: z.boolean() }),
});

// Admin-only — see clientCompany.routes.ts.
export const setPrimarySupportLeadSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
  }),
  body: z.object({ isPrimary: z.boolean() }),
});
