// modules/activity/dto/activity.dto.js

function toActivityResponse(a) {
  if (!a) return null;
  const actor = a.actor
    ? {
        id: a.actor.id,
        name: [a.actor.firstName, a.actor.lastName].filter(Boolean).join(" "),
        email: a.actor.email,
      }
    : null;
  return {
    id: a.id,
    action: a.action,
    summary: a.summary,
    entityType: a.entityType ?? null,
    entityId: a.entityId ?? null,
    actor,
    createdAt: a.createdAt,
  };
}

module.exports = { toActivityResponse };
