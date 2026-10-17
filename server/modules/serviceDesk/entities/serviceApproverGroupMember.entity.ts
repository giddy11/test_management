// modules/serviceDesk/entities/serviceApproverGroupMember.entity.ts
import { EntitySchema } from "typeorm";

export interface ServiceApproverGroupMember {
  groupId: string;
  userId: string;
  group?: object;
  user?: object;
}

const ServiceApproverGroupMember = new EntitySchema<ServiceApproverGroupMember>({
  name: "ServiceApproverGroupMember",
  tableName: "service_approver_group_members",
  columns: {
    groupId: { name: "group_id", type: "uuid", primary: true },
    userId: { name: "user_id", type: "uuid", primary: true },
  },
  relations: {
    group: { type: "many-to-one", target: "ServiceApproverGroup", joinColumn: { name: "group_id" }, onDelete: "CASCADE" },
    user: { type: "many-to-one", target: "User", joinColumn: { name: "user_id" }, onDelete: "CASCADE" },
  },
});

export { ServiceApproverGroupMember };
