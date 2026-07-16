// shared/types/actor.ts
// The authenticated caller every service method receives (controllers pass req.user).
export interface Actor {
  id: string;
  role: string; // UserRole: superadmin | admin | user | it_support
  organizationId?: string | null;
  // Set only for it_support actors — the client company they belong to.
  clientCompanyId?: string | null;
  // Set only for it_support actors — can assign queue items to teammates.
  isSupportLead?: boolean;
}
