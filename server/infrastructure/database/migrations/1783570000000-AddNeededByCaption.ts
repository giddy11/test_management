// Migration: the "Needed by" question gets a caption. The starter catalog now
// ships it (domain/defaultCatalog.ts); this gives it to organisations whose
// catalog was seeded before. Only a "needed_by" date question with no caption
// of its own is touched, so wording an administrator wrote is kept.
import type { MigrationInterface, QueryRunner } from "typeorm";

const CAPTION = "When do you need this by? IT will try to have it ready before then.";

const MATCHES = `f->>'key' = 'needed_by' AND f->>'type' = 'date' AND COALESCE(f->>'helpText', '') = ''`;

export class AddNeededByCaption1783570000000 implements MigrationInterface {
  name = "AddNeededByCaption1783570000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `
      UPDATE "service_catalog_items" i
         SET "form_schema" = (
           SELECT jsonb_agg(CASE WHEN ${MATCHES} THEN f || jsonb_build_object('helpText', $1::text) ELSE f END ORDER BY e.ord)
             FROM jsonb_array_elements(i."form_schema") WITH ORDINALITY AS e(f, ord)
         )
       WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(i."form_schema") AS f WHERE ${MATCHES})
      `,
      [CAPTION]
    );
  }

  async down(q: QueryRunner): Promise<void> {
    const ours = `f->>'key' = 'needed_by' AND f->>'helpText' = $1`;
    await q.query(
      `
      UPDATE "service_catalog_items" i
         SET "form_schema" = (
           SELECT jsonb_agg(CASE WHEN ${ours} THEN f || '{"helpText": null}'::jsonb ELSE f END ORDER BY e.ord)
             FROM jsonb_array_elements(i."form_schema") WITH ORDINALITY AS e(f, ord)
         )
       WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(i."form_schema") AS f WHERE ${ours})
      `,
      [CAPTION]
    );
  }
}
