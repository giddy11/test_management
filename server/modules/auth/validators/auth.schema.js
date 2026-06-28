// modules/auth/validators/auth.schema.js
const { z } = require("zod");

const passwordRule = z
  .string()
  .min(8)
  .max(64)
  .regex(/[A-Z]/, "Must contain an uppercase letter")
  .regex(/[0-9]/, "Must contain a number");

const registerSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    companyName: z.string().min(1).max(200),
    email: z.string().email(),
    password: passwordRule,
    // Optional address details.
    address: z.string().max(500).optional(),
    city: z.string().max(120).optional(),
    state: z.string().max(120).optional(),
    country: z.string().max(120).optional(),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
});

const refreshSchema = z.object({
  body: z.object({ refreshToken: z.string().min(1) }),
});

const logoutSchema = z.object({
  body: z.object({ refreshToken: z.string().min(1) }),
});

const googleSchema = z.object({
  body: z.object({ idToken: z.string().min(1) }),
});

const verifyEmailSchema = z.object({
  body: z.object({
    email: z.string().email(),
    code: z.string().length(6),
  }),
});

const resendVerificationSchema = z.object({
  body: z.object({ email: z.string().email() }),
});

const forgotPasswordSchema = z.object({
  body: z.object({ email: z.string().email() }),
});

const resetPasswordSchema = z.object({
  body: z.object({
    email: z.string().email(),
    code: z.string().length(6),
    newPassword: passwordRule,
  }),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  googleSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
