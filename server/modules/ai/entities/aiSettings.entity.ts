// modules/ai/entities/aiSettings.entity.ts
// An organisation's AI settings — one row per org, absent means defaults.
// creditPrices: { [feature]: credits per request } on the organisation's key.
// A missing or 0 price is free, and an organisation with no prices set has no
// metering at all (that is the "credits are off" state).
import { EntitySchema } from "typeorm";

export interface AiSettings {
  organizationId: string;
  creditPrices: Record<string, number>;
  updatedById: string | null;
  updatedAt: Date;
}

const AiSettings = new EntitySchema<AiSettings>({
  name: "AiSettings",
  tableName: "ai_settings",
  columns: {
    organizationId: { name: "organization_id", type: "uuid", primary: true },
    creditPrices: { name: "credit_prices", type: "jsonb", default: () => "'{}'::jsonb" },
    updatedById: { name: "updated_by_id", type: "uuid", nullable: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
});

export { AiSettings };
