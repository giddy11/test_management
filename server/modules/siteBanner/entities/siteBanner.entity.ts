// modules/siteBanner/entities/siteBanner.entity.ts
// Site-wide broadcast banner — a single toggle-able row (id is always "global"),
// not a log. The superadmin turns it on with a message + duration, or off early.
import { EntitySchema } from "typeorm";

export interface SiteBanner {
  id: string;
  message: string | null;
  isActive: boolean;
  durationMinutes: number | null;
  startedAt: Date | null;
  expiresAt: Date | null;
  updatedBy: string | null;
  updatedAt: Date;
}

const SiteBanner = new EntitySchema<SiteBanner>({
  name: "SiteBanner",
  tableName: "site_banner",
  columns: {
    id: {
      type: "varchar",
      length: 20,
      primary: true,
    },
    message: {
      type: "text",
      nullable: true,
    },
    isActive: {
      name: "is_active",
      type: "boolean",
      default: false,
    },
    durationMinutes: {
      name: "duration_minutes",
      type: "integer",
      nullable: true,
    },
    startedAt: {
      name: "started_at",
      type: "timestamptz",
      nullable: true,
    },
    expiresAt: {
      name: "expires_at",
      type: "timestamptz",
      nullable: true,
    },
    updatedBy: {
      name: "updated_by",
      type: "uuid",
      nullable: true,
    },
    updatedAt: {
      name: "updated_at",
      type: "timestamptz",
      updateDate: true,
    },
  },
});

export { SiteBanner };
