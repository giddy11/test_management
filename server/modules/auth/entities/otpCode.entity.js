// modules/auth/entities/otpCode.entity.js
// Short-lived one-time codes emailed for email verification and password reset.
// Only the SHA-256 hash of the code is stored — never the raw digits.
const { EntitySchema } = require("typeorm");
const { enums } = require("../../../config/constants");

const OtpCode = new EntitySchema({
  name: "OtpCode",
  tableName: "otp_codes",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    email: {
      type: "varchar",
      length: 255,
    },
    codeHash: {
      name: "code_hash",
      type: "varchar",
      length: 255,
    },
    type: {
      type: "enum",
      enum: enums.otpType,
    },
    expiresAt: {
      name: "expires_at",
      type: "timestamptz",
    },
    consumedAt: {
      name: "consumed_at",
      type: "timestamptz",
      nullable: true,
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
  },
  indices: [{ name: "idx_otp_codes_email_type", columns: ["email", "type"] }],
});

module.exports = { OtpCode };
