// modules/auth/routes/auth.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
const { publicRoute, requireAuthenticatedOnly } = require("../../../shared/access/can");
const { authRateLimiter } = require("../../../shared/middleware/rateLimiter.middleware");
const {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  googleSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
  updateOnboardingSchema,
  updateNotificationSoundSchema,
} = require("../validators/auth.schema");
const { AuthController } = require("../controllers/auth.controller");

router.post("/register", publicRoute("Registration"), authRateLimiter, validate(registerSchema), AuthController.register);
router.post("/login", publicRoute("Sign-in"), authRateLimiter, validate(loginSchema), AuthController.login);
router.post("/refresh", publicRoute("Token refresh"), authRateLimiter, validate(refreshSchema), AuthController.refresh);
router.post("/google", publicRoute("Google sign-in"), authRateLimiter, validate(googleSchema), AuthController.google);

// Email verification
router.post("/verify-email", publicRoute("Email verification"), authRateLimiter, validate(verifyEmailSchema), AuthController.verifyEmail);
router.post("/resend-verification", publicRoute("Email verification"), authRateLimiter, validate(resendVerificationSchema), AuthController.resendVerification);

// Password reset
router.post("/forgot-password", publicRoute("Password reset"), authRateLimiter, validate(forgotPasswordSchema), AuthController.forgotPassword);
router.post("/reset-password", publicRoute("Password reset"), authRateLimiter, validate(resetPasswordSchema), AuthController.resetPassword);

router.post("/logout", authMiddleware, requireAuthenticatedOnly("Own session"), validate(logoutSchema), AuthController.logout);
router.get("/me", authMiddleware, requireAuthenticatedOnly("Own account"), AuthController.me);
router.patch("/change-password", authMiddleware, requireAuthenticatedOnly("Own password"), validate(changePasswordSchema), AuthController.changePassword);
router.patch("/profile", authMiddleware, requireAuthenticatedOnly("Own profile"), validate(updateProfileSchema), AuthController.updateProfile);
router.patch("/onboarding", authMiddleware, requireAuthenticatedOnly("Own onboarding state"), validate(updateOnboardingSchema), AuthController.updateOnboarding);
router.patch("/notification-sound", authMiddleware, requireAuthenticatedOnly("Own preferences"), validate(updateNotificationSoundSchema), AuthController.updateNotificationSound);

module.exports = router;
