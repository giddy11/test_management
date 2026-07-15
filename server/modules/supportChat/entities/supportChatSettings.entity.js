// modules/supportChat/entities/supportChatSettings.entity.js
// Single-row global config for the in-app support chat (id is always "global").
// The super admin flips `enabled` to show/hide the floating widget for all users
// — same singleton-row pattern as SiteBanner.
const { EntitySchema } = require("typeorm");

const SupportChatSettings = new EntitySchema({
  name: "SupportChatSettings",
  tableName: "support_chat_settings",
  columns: {
    id: {
      type: "varchar",
      length: 20,
      primary: true,
    },
    // When false, the user-facing floater is hidden platform-wide. Defaults to
    // on so the feature works out of the box.
    enabled: {
      type: "boolean",
      default: true,
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

module.exports = { SupportChatSettings };
