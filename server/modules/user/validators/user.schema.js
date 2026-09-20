// modules/user/validators/user.schema.js
const { z } = require("zod");

// Roles an admin is allowed to assign. (superadmin is granted only via seed script.)
const assignableRoles = ["admin", "user"];

const createUserSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    email: z.string().email(),
    password: z
      .string()
      .min(8)
      .max(64)
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/[0-9]/, "Must contain a number"),
    role: z.enum(assignableRoles).default("user"),
    // Roles & access: the roles to grant the new account. Omitted means the
    // built-in role their legacy role maps to (see UserService.createUser).
    roleIds: z.array(z.string().uuid()).max(20).optional(),
  }),
});

const updateUserSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
      role: z.enum(assignableRoles).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "At least one field must be provided",
    }),
});

const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

const fetchUsersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
  }),
});

module.exports = {
  createUserSchema,
  updateUserSchema,
  idParamSchema,
  fetchUsersSchema,
};
