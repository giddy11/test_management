// modules/project/dto/project.dto.ts
import type { Project } from "../entities/project.entity";

interface MemberResponse {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function toProjectResponse(project: Project | null) {
  if (!project) return null;
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    ownerId: project.ownerId,
    members: Array.isArray(project.memberships)
      ? project.memberships.reduce<MemberResponse[]>((acc, m) => {
          const u = m.user as
            | { id: string; firstName: string; lastName: string | null; email: string }
            | undefined;
          if (u) {
            acc.push({
              id: u.id,
              name: [u.firstName, u.lastName].filter(Boolean).join(" "),
              email: u.email,
              role: m.role,
            });
          }
          return acc;
        }, [])
      : undefined,
    suiteCount: project.suiteCount ?? 0,
    createdAt: project.createdAt,
  };
}
