// shared/types/actor.ts
// The authenticated caller every service method receives (controllers pass req.user).
export interface Actor {
  id: string;
  role: string; // UserRole: superadmin | admin | user
  organizationId?: string | null;
}
