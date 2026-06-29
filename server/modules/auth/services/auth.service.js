// modules/auth/services/auth.service.js
// All authentication business logic. Throws AppError for domain failures.
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const { AuthRepository } = require("../repositories/auth.repository");
const { AppError } = require("../../../shared/errors/AppError");
const { env } = require("../../../config/env");
const { AuthProvider, UserRole, OtpType } = require("../../../config/constants");
const {
  hashPassword,
  comparePassword,
  hashToken,
  generateOtp,
} = require("../../../shared/utils/password");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  accessTokenTtlSeconds,
} = require("../../../shared/utils/jwt");
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("../../../shared/utils/mailer");

class AuthService {
  static Instance = new AuthService();

  constructor(authRepo = AuthRepository.Instance) {
    this.authRepo = authRepo;
    this.googleClient = env.google.clientId
      ? new OAuth2Client(env.google.clientId)
      : null;
  }

  // ── Token helpers ────────────────────────────────────────────────────────────
  async issueTokens(user) {
    const payload = { id: user.id, email: user.email, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken({ id: user.id });

    const decoded = verifyRefreshToken(refreshToken);
    await this.authRepo.saveRefreshToken({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(decoded.exp * 1000),
      revoked: false,
    });

    return { accessToken, refreshToken, expiresIn: accessTokenTtlSeconds() };
  }

  // Generates a fresh OTP, invalidates older ones of the same type, emails it.
  async issueOtp(user, type) {
    const code = generateOtp(6);
    await this.authRepo.invalidateOtps(user.email, type);
    await this.authRepo.saveOtp({
      email: user.email,
      codeHash: hashToken(code),
      type,
      expiresAt: new Date(Date.now() + env.otpTtlMinutes * 60 * 1000),
    });

    const sender =
      type === OtpType.VERIFY_EMAIL ? sendVerificationEmail : sendPasswordResetEmail;
    // Fire-and-forget — an email failure must never break the request.
    sender(user.email, code, user.firstName).catch((err) =>
      console.error("[mailer] send failed:", err.message)
    );
    if (!env.isProduction) console.info(`[otp] ${type} for ${user.email}: ${code}`);
  }

  // ── Register ─────────────────────────────────────────────────────────────────
  async register(data) {
    const existing = await this.authRepo.findUserByEmail(data.email);
    if (existing) {
      throw new AppError("An account with this email already exists", 409);
    }

    const user = await this.authRepo.createUser({
      firstName: data.firstName,
      lastName: data.lastName,
      companyName: data.companyName,
      email: data.email,
      password: await hashPassword(data.password),
      address: data.address ?? null,
      city: data.city ?? null,
      state: data.state ?? null,
      country: data.country ?? null,
      role: UserRole.ADMIN,
      provider: AuthProvider.LOCAL,
      isEmailVerified: false,
      organizationId: crypto.randomUUID(), // this admin starts a new organisation
    });

    await this.issueOtp(user, OtpType.VERIFY_EMAIL);
    const tokens = await this.issueTokens(user);
    return { user, tokens };
  }

  // ── Email verification ─────────────────────────────────────────────────────────
  async verifyEmail({ email, code }) {
    const user = await this.authRepo.findUserByEmail(email);
    if (!user) throw new AppError("Account not found", 404);
    if (user.isEmailVerified) return user;

    const otp = await this.authRepo.findActiveOtp(
      email,
      OtpType.VERIFY_EMAIL,
      hashToken(code)
    );
    if (!otp) throw new AppError("Invalid or expired code", 400);

    await this.authRepo.consumeOtp(otp.id);
    return this.authRepo.updateUser(user.id, { isEmailVerified: true });
  }

  async resendVerification({ email }) {
    const user = await this.authRepo.findUserByEmail(email);
    // Only issue if the account exists and is still unverified.
    if (user && !user.isEmailVerified) {
      await this.issueOtp(user, OtpType.VERIFY_EMAIL);
    }
  }

  // ── Login ────────────────────────────────────────────────────────────────────
  async login({ email, password }) {
    const user = await this.authRepo.findUserByEmailWithPassword(email);
    if (!user || !user.password) {
      throw new AppError("Invalid email or password", 401);
    }
    const valid = await comparePassword(password, user.password);
    if (!valid) throw new AppError("Invalid email or password", 401);

    const tokens = await this.issueTokens(user);
    return { user, tokens };
  }

  // ── Refresh ──────────────────────────────────────────────────────────────────
  async refresh({ refreshToken }) {
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      throw new AppError("Refresh token invalid or expired", 401);
    }

    const record = await this.authRepo.findActiveRefreshToken(
      decoded.id,
      hashToken(refreshToken)
    );
    if (!record) throw new AppError("Refresh token invalid or expired", 401);

    const user = await this.authRepo.findUserById(decoded.id);
    if (!user) throw new AppError("Refresh token invalid or expired", 401);

    await this.authRepo.revokeRefreshToken(record.id);
    const tokens = await this.issueTokens(user);
    return { user, tokens };
  }

  // ── Logout ───────────────────────────────────────────────────────────────────
  async logout({ refreshToken }) {
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return; // already invalid — idempotent
    }
    const record = await this.authRepo.findActiveRefreshToken(
      decoded.id,
      hashToken(refreshToken)
    );
    if (record) await this.authRepo.revokeRefreshToken(record.id);
  }

  // ── Forgot / reset password ─────────────────────────────────────────────────────
  async forgotPassword({ email }) {
    const user = await this.authRepo.findUserByEmail(email);
    // Never reveal whether the email exists — always resolve the same way.
    if (user && user.provider === AuthProvider.LOCAL) {
      await this.issueOtp(user, OtpType.RESET_PASSWORD);
    }
  }

  async resetPassword({ email, code, newPassword }) {
    const user = await this.authRepo.findUserByEmail(email);
    if (!user) throw new AppError("Invalid or expired code", 400);

    const otp = await this.authRepo.findActiveOtp(
      email,
      OtpType.RESET_PASSWORD,
      hashToken(code)
    );
    if (!otp) throw new AppError("Invalid or expired code", 400);

    await this.authRepo.consumeOtp(otp.id);
    await this.authRepo.updateUser(user.id, {
      password: await hashPassword(newPassword),
    });
    // Force re-login everywhere after a password change.
    await this.authRepo.revokeAllForUser(user.id);
  }

  // ── Google Sign In ─────────────────────────────────────────────────────────────
  async google({ idToken }) {
    if (!this.googleClient) {
      throw new AppError("Google Sign In is not configured", 503);
    }

    let payload;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: env.google.clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new AppError("Invalid Google token", 401);
    }

    if (!payload?.email || !payload.email_verified) {
      throw new AppError("Google account email is not verified", 401);
    }

    let user = await this.authRepo.findUserByGoogleId(payload.sub);
    if (!user) user = await this.authRepo.findUserByEmail(payload.email);

    if (!user) {
      user = await this.authRepo.createUser({
        firstName: payload.given_name || payload.name || payload.email.split("@")[0],
        lastName: payload.family_name || "",
        companyName: null,
        email: payload.email,
        password: null,
        role: UserRole.ADMIN,
        provider: AuthProvider.GOOGLE,
        googleId: payload.sub,
        avatarUrl: payload.picture ?? null,
        isEmailVerified: true, // Google already verified the address
        organizationId: crypto.randomUUID(),
      });
    } else if (!user.googleId) {
      user = await this.authRepo.updateUser(user.id, {
        googleId: payload.sub,
        avatarUrl: user.avatarUrl ?? payload.picture ?? null,
        isEmailVerified: true,
      });
    }

    const tokens = await this.issueTokens(user);
    return { user, tokens };
  }
}

module.exports = { AuthService };
