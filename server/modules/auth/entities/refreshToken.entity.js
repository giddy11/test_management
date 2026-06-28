// modules/auth/entities/refreshToken.entity.js
// Stores only the SHA-256 hash of a refresh token — never the raw token.
const { EntitySchema } = require("typeorm");

const RefreshToken = new EntitySchema({
  name: "RefreshToken",
  tableName: "refresh_tokens",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    userId: {
      name: "user_id",
      type: "uuid",
    },
    tokenHash: {
      name: "token_hash",
      type: "varchar",
      length: 255,
    },
    expiresAt: {
      name: "expires_at",
      type: "timestamptz",
    },
    revoked: {
      type: "boolean",
      default: false,
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
  },
  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "user_id" },
      onDelete: "CASCADE",
    },
  },
  indices: [
    { name: "idx_refresh_tokens_user_id", columns: ["userId"] },
    { name: "idx_refresh_tokens_token_hash", columns: ["tokenHash"] },
  ],
});

module.exports = { RefreshToken };
