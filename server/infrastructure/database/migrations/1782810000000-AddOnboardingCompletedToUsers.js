// Migration: add the onboarding_completed flag to users (additive, defaults false).
module.exports = class AddOnboardingCompletedToUsers1782810000000 {
  name = "AddOnboardingCompletedToUsers1782810000000";

  async up(q) {
    await q.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_completed" boolean NOT NULL DEFAULT false`);
  }

  async down(q) {
    await q.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "onboarding_completed"`);
  }
};
