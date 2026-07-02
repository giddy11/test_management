// Migration: feature_request_attachments table + feature_requests.reference_links column.
module.exports = class AddFeatureRequestAttachmentsAndLinks1782830000000 {
  name = "AddFeatureRequestAttachmentsAndLinks1782830000000";

  async up(q) {
    await q.query(
      `ALTER TABLE "feature_requests" ADD COLUMN IF NOT EXISTS "reference_links" text[]`
    );

    await q.query(`
      CREATE TABLE IF NOT EXISTS "feature_request_attachments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "feature_request_id" uuid NOT NULL REFERENCES "feature_requests"("id") ON DELETE CASCADE,
        "file_name" varchar(255) NOT NULL,
        "file_url" text NOT NULL,
        "file_public_id" varchar(255),
        "mime_type" varchar(100) NOT NULL,
        "file_size_bytes" integer NOT NULL,
        "uploaded_by_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_fr_attachments_feature_request_id" ON "feature_request_attachments" ("feature_request_id")`
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_fr_attachments_uploaded_by_id" ON "feature_request_attachments" ("uploaded_by_id")`
    );
  }

  async down(q) {
    await q.query(`DROP TABLE IF EXISTS "feature_request_attachments"`);
    await q.query(`ALTER TABLE "feature_requests" DROP COLUMN IF EXISTS "reference_links"`);
  }
};
