// Migration: each project's own "Contact support" WhatsApp number (E.164).
// Set by the project's team lead (or project.manageall); null hides the
// project from the widget's "which product is this about?" picker.
import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddProjectSupportWhatsappNumber1783470000000 implements MigrationInterface {
  name = "AddProjectSupportWhatsappNumber1783470000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "support_whatsapp_number" varchar(20)`
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "projects" DROP COLUMN IF EXISTS "support_whatsapp_number"`);
  }
}
