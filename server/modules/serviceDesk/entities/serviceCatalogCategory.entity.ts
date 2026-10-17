// modules/serviceDesk/entities/serviceCatalogCategory.entity.ts
// A tile on the request portal ("Software access", "Hardware", …). `key` is
// the stable identity the default catalog seeds by; custom categories get a
// slug of their name.
import { EntitySchema } from "typeorm";

export interface ServiceCatalogCategory {
  id: string;
  organizationId: string;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
}

const ServiceCatalogCategory = new EntitySchema<ServiceCatalogCategory>({
  name: "ServiceCatalogCategory",
  tableName: "service_catalog_categories",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    organizationId: { name: "organization_id", type: "uuid" },
    key: { type: "varchar", length: 40 },
    name: { type: "varchar", length: 80 },
    description: { type: "varchar", length: 300, nullable: true },
    icon: { type: "varchar", length: 40, nullable: true },
    sortOrder: { name: "sort_order", type: "int", default: 0 },
    isActive: { name: "is_active", type: "boolean", default: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
  },
  uniques: [{ name: "uq_service_catalog_categories_org_key", columns: ["organizationId", "key"] }],
});

export { ServiceCatalogCategory };
