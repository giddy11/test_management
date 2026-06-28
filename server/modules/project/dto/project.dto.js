// modules/project/dto/project.dto.js

function toProjectResponse(project) {
  if (!project) return null;
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    ownerId: project.ownerId,
    members: Array.isArray(project.members)
      ? project.members.map((m) => ({
          id: m.id,
          name: [m.firstName, m.lastName].filter(Boolean).join(" "),
          email: m.email,
        }))
      : undefined,
    createdAt: project.createdAt,
  };
}

module.exports = { toProjectResponse };
