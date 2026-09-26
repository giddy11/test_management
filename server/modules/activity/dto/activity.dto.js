// modules/activity/dto/activity.dto.js

// Prefers what was denormalised onto the row at write time and only falls back
// to the joined user for rows written before actor_name existed. Reading the
// live user first would be wrong, not merely redundant: the point of the stored
// copy is that the log keeps naming the person as they were at the time.
function actorOf(a) {
  const joinedName = a.actor
    ? [a.actor.firstName, a.actor.lastName].filter(Boolean).join(" ")
    : null;
  const name = a.actorName || joinedName || null;
  if (!name && !a.actorId) return null;
  return {
    id: a.actorId ?? a.actor?.id ?? null,
    name: name ?? "Unknown user",
    role: a.actorRole ?? null,
    email: a.actor?.email ?? null,
  };
}

function toActivityResponse(a) {
  if (!a) return null;
  return {
    id: a.id,
    action: a.action,
    summary: a.summary,
    severity: a.severity ?? "info",
    entityType: a.entityType ?? null,
    entityId: a.entityId ?? null,
    metadata: a.metadata ?? null,
    actor: actorOf(a),
    createdAt: a.createdAt,
  };
}

module.exports = { toActivityResponse };
