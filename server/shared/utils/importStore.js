// shared/utils/importStore.js
// Ephemeral, in-memory store for import preview sessions (1h TTL).
// NOTE: single-instance only. For multi-instance/prod, back this with the
// import_sessions DB table or Redis (same interface).
const crypto = require("crypto");

const TTL_MS = 60 * 60 * 1000; // 1 hour
const sessions = new Map();

function sweep() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.expiresAt <= now) sessions.delete(id);
  }
}

const importStore = {
  create(data) {
    sweep();
    const id = crypto.randomUUID();
    sessions.set(id, { ...data, id, expiresAt: Date.now() + TTL_MS });
    return id;
  },

  get(id) {
    const s = sessions.get(id);
    if (!s) return null;
    if (s.expiresAt <= Date.now()) {
      sessions.delete(id);
      return null;
    }
    return s;
  },

  delete(id) {
    sessions.delete(id);
  },
};

module.exports = { importStore };
