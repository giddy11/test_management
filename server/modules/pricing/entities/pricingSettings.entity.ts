// modules/pricing/entities/pricingSettings.entity.ts
// The landing page's pricing section — a single row (id is always "global"),
// like site_banner. No row means "show the built-in defaults".
import { EntitySchema } from "typeorm";
import type { PricingContent } from "../domain/defaultPricing";

export interface PricingSettings {
  id: string;
  content: PricingContent;
  updatedBy: string | null;
  updatedAt: Date;
}

const PricingSettings = new EntitySchema<PricingSettings>({
  name: "PricingSettings",
  tableName: "pricing_settings",
  columns: {
    id: { type: "varchar", length: 20, primary: true },
    content: { type: "jsonb" },
    updatedBy: { name: "updated_by", type: "uuid", nullable: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
});

export { PricingSettings };
