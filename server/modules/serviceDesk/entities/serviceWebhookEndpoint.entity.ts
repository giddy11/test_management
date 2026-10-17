// modules/serviceDesk/entities/serviceWebhookEndpoint.entity.ts
// A fulfilment connector: an HTTPS endpoint (Power Automate, Logic Apps, n8n…)
// that does the provisioning. The full URL often carries its own secret (a
// signed query string), so it is sealed like the signing secret; urlDisplay is
// the origin and path only, safe to show.
import { EntitySchema } from "typeorm";

export interface ServiceWebhookEndpoint {
  id: string;
  organizationId: string;
  name: string;
  urlDisplay: string;
  urlSealed: string;
  secretSealed: string;
  isActive: boolean;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastFailure: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: object;
}

const ServiceWebhookEndpoint = new EntitySchema<ServiceWebhookEndpoint>({
  name: "ServiceWebhookEndpoint",
  tableName: "service_webhook_endpoints",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    organizationId: { name: "organization_id", type: "uuid" },
    name: { type: "varchar", length: 80 },
    urlDisplay: { name: "url_display", type: "varchar", length: 300 },
    urlSealed: { name: "url_sealed", type: "text" },
    secretSealed: { name: "secret_sealed", type: "text" },
    isActive: { name: "is_active", type: "boolean", default: true },
    lastSuccessAt: { name: "last_success_at", type: "timestamptz", nullable: true },
    lastFailureAt: { name: "last_failure_at", type: "timestamptz", nullable: true },
    lastFailure: { name: "last_failure", type: "varchar", length: 300, nullable: true },
    createdById: { name: "created_by_id", type: "uuid", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
  relations: {
    createdBy: { type: "many-to-one", target: "User", joinColumn: { name: "created_by_id" }, nullable: true, onDelete: "SET NULL" },
  },
  uniques: [{ name: "uq_service_webhook_endpoints_org_name", columns: ["organizationId", "name"] }],
});

export { ServiceWebhookEndpoint };
