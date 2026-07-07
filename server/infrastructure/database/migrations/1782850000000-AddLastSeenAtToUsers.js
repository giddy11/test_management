// Migration: add last_seen_at to users (additive, nullable — set on socket disconnect).
module.exports = class AddLastSeenAtToUsers1782850000000 {
  name = "AddLastSeenAtToUsers1782850000000";

  async up(q) {
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamptz`);
  }

  async down(q) {
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "last_seen_at"`);
  }
};
