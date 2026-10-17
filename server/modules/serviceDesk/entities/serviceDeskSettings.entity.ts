// modules/serviceDesk/entities/serviceDeskSettings.entity.ts
// Whether an organisation has IT requests turned on — one row per org, absent
// means off. Off still lets servicedesk.manage holders set the catalog up.
import { EntitySchema } from "typeorm";

export interface ServiceDeskSettings {
  organizationId: string;
  enabled: boolean;
  updatedById: string | null;
  updatedAt: Date;
  updatedBy?: object;
}

const ServiceDeskSettings = new EntitySchema<ServiceDeskSettings>({
  name: "ServiceDeskSettings",
  tableName: "service_desk_settings",
  columns: {
    organizationId: { name: "organization_id", type: "uuid", primary: true },
    enabled: { type: "boolean", default: false },
    updatedById: { name: "updated_by_id", type: "uuid", nullable: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
  relations: {
    updatedBy: { type: "many-to-one", target: "User", joinColumn: { name: "updated_by_id" }, nullable: true, onDelete: "SET NULL" },
  },
});

export { ServiceDeskSettings };
