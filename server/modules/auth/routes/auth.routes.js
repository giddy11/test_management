// modules/auth/routes/auth.routes.js
const router = require("express").Router();
const { validate } = require("../../../shared/middleware/validate.middleware");
const { authMiddleware } = require("../../../shared/middleware/auth.middleware");
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

router.post("/register", authRateLimiter, validate(registerSchema), AuthController.register);
router.post("/login", authRateLimiter, validate(loginSchema), AuthController.login);
router.post("/refresh", authRateLimiter, validate(refreshSchema), AuthController.refresh);
router.post("/google", authRateLimiter, validate(googleSchema), AuthController.google);

// Email verification
router.post("/verify-email", authRateLimiter, validate(verifyEmailSchema), AuthController.verifyEmail);
router.post("/resend-verification", authRateLimiter, validate(resendVerificationSchema), AuthController.resendVerification);

// Password reset
router.post("/forgot-password", authRateLimiter, validate(forgotPasswordSchema), AuthController.forgotPassword);
router.post("/reset-password", authRateLimiter, validate(resetPasswordSchema), AuthController.resetPassword);

router.post("/logout", authMiddleware, validate(logoutSchema), AuthController.logout);
router.get("/me", authMiddleware, AuthController.me);
router.patch("/change-password", authMiddleware, validate(changePasswordSchema), AuthController.changePassword);
router.patch("/profile", authMiddleware, validate(updateProfileSchema), AuthController.updateProfile);
router.patch("/onboarding", authMiddleware, validate(updateOnboardingSchema), AuthController.updateOnboarding);
router.patch("/notification-sound", authMiddleware, validate(updateNotificationSoundSchema), AuthController.updateNotificationSound);

module.exports = router;
