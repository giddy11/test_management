// modules/auth/entities/user.entity.js
// THE MODEL for users. Owned exclusively by the auth/user repositories.
const { EntitySchema } = require("typeorm");
const { enums, UserRole, AuthProvider } = require("../../../config/constants");

const User = new EntitySchema({
  name: "User",
  tableName: "users",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    firstName: {
      name: "first_name",
      type: "varchar",
      length: 100,
    },
    lastName: {
      name: "last_name",
      type: "varchar",
      length: 100,
    },
    // Organisation/company name. Nullable to support OAuth users without one.
    companyName: {
      name: "company_name",
      type: "varchar",
      length: 200,
      nullable: true,
    },
    email: {
      type: "varchar",
      length: 255,
      unique: true,
    },
    isEmailVerified: {
      name: "is_email_verified",
      type: "boolean",
      default: false,
    },
    onboardingCompleted: {
      name: "onboarding_completed",
      type: "boolean",
      default: false,
    },
    // Groups all members of one company. Set to a fresh id when an admin registers;
    // members the admin creates inherit the admin's organizationId.
    organizationId: {
      name: "organization_id",
      type: "uuid",
      nullable: true,
    },
    // Set only on it_support accounts — the client company (client_companies.id)
    // whose feedback queue this supporter works.
    clientCompanyId: {
      name: "client_company_id",
      type: "uuid",
      nullable: true,
    },
    // ── Address ──────────────────────────────────────────────────────────────
    address: {
      type: "text",
      nullable: true,
    },
    city: {
      type: "varchar",
      length: 120,
      nullable: true,
    },
    state: {
      type: "varchar",
      length: 120,
      nullable: true,
    },
    country: {
      type: "varchar",
      length: 120,
      nullable: true,
    },
    // Nullable: OAuth (Google) users never have a local password.
    password: {
      name: "password",
      type: "varchar",
      length: 255,
      nullable: true,
      select: false, // never returned by default queries
    },
    role: {
      type: "enum",
      enum: enums.userRole,
      default: UserRole.ADMIN,
    },
    provider: {
      type: "enum",
      enum: enums.authProvider,
      default: AuthProvider.LOCAL,
    },
    googleId: {
      name: "google_id",
      type: "varchar",
      length: 255,
      nullable: true,
    },
    avatarUrl: {
      name: "avatar_url",
      type: "text",
      nullable: true,
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
    // Updated when the user's last realtime (Socket.IO) connection drops — see
    // infrastructure/realtime/socketServer.js. Null means they've never connected.
    lastSeenAt: {
      name: "last_seen_at",
      type: "timestamptz",
      nullable: true,
    },
    // "What's new" announcements: the user has seen every app update created at
    // or before this timestamp. Null means the modal has never been dismissed.
    updatesSeenAt: {
      name: "updates_seen_at",
      type: "timestamptz",
      nullable: true,
    },
    deletedAt: {
      name: "deleted_at",
      type: "timestamptz",
      deleteDate: true,
      nullable: true,
    },
  },
  indices: [
    { name: "idx_users_email", columns: ["email"], unique: true },
    { name: "idx_users_google_id", columns: ["googleId"] },
    { name: "idx_users_organization_id", columns: ["organizationId"] },
    { name: "idx_users_client_company_id", columns: ["clientCompanyId"] },
  ],
});

module.exports = { User };
