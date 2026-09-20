// shared/access/permissionCache.js
//
// A tiny in-process cache for resolved permission sets, so the resolver costs
// one indexed query per user every few seconds instead of one per request.
//
// Deliberately short-lived and explicitly invalidated: the Roles & access UI
// promises that editing a role takes effect for its N members, so a stale entry
// is a correctness bug, not just a performance detail. Every write path in
// access.service.js calls invalidate()/invalidateRole().
//
// Per process, not shared across instances — the TTL is the upper bound on how
// long another instance can be stale, which is why it is seconds and not minutes.
const TTL_MS = 10_000;
const MAX_ENTRIES = 5_000;

const store = new Map(); // userId -> { codes: Set<string>, expiresAt: number }

function get(userId) {
  const hit = store.get(userId);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    store.delete(userId);
    return null;
  }
  return hit.codes;
}

function set(userId, codes) {
  // Cheap bound: on overflow, drop the oldest insertions. Map preserves
  // insertion order, so the first keys are the coldest.
  if (store.size >= MAX_ENTRIES) {
    const excess = store.size - MAX_ENTRIES + 1;
    let i = 0;
    for (const key of store.keys()) {
      store.delete(key);
      if (++i >= excess) break;
    }
  }
  const value = new Set(codes);
  store.set(userId, { codes: value, expiresAt: Date.now() + TTL_MS });
  return value;
}

function invalidate(userId) {
  store.delete(userId);
}

// A role's permission set changed, or its membership did — we don't track which
// users hold which role in here, so drop everything. Role edits are rare.
function invalidateAll() {
  store.clear();
}

module.exports = { get, set, invalidate, invalidateAll, TTL_MS };
