// modules/auth/repositories/auth.repository.js
// All data access for users + refresh tokens. No business logic here.
const { AppDataSource } = require("../../../infrastructure/database/dataSource");
const { User } = require("../entities/user.entity");
const { RefreshToken } = require("../entities/refreshToken.entity");
const { OtpCode } = require("../entities/otpCode.entity");

class AuthRepository {
  static Instance = new AuthRepository();

  constructor() {
    this.users = AppDataSource.getRepository(User);
    this.refreshTokens = AppDataSource.getRepository(RefreshToken);
    this.otpCodes = AppDataSource.getRepository(OtpCode);
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  async findUserById(id) {
    return this.users.findOne({ where: { id } });
  }

  async findUserByEmail(email) {
    return this.users.findOne({ where: { email } });
  }

  // Includes the password column (normally select:false) for login verification.
  async findUserByEmailWithPassword(email) {
    return this.users
      .createQueryBuilder("user")
      .addSelect("user.password")
      .where("user.email = :email", { email })
      .getOne();
  }

  async findUserByGoogleId(googleId) {
    return this.users.findOne({ where: { googleId } });
  }

  async findByRole(role) {
    return this.users.find({ where: { role } });
  }

  async createUser(data) {
    return this.users.save(this.users.create(data));
  }

  async updateUser(id, data) {
    await this.users.update(id, data);
    return this.findUserById(id);
  }

  // ── Refresh tokens ───────────────────────────────────────────────────────────
  async saveRefreshToken(data) {
    return this.refreshTokens.save(this.refreshTokens.create(data));
  }

  async findActiveRefreshToken(userId, tokenHash) {
    return this.refreshTokens.findOne({
      where: { userId, tokenHash, revoked: false },
    });
  }

  async revokeRefreshToken(id) {
    await this.refreshTokens.update(id, { revoked: true });
  }

  async revokeAllForUser(userId) {
    await this.refreshTokens.update({ userId, revoked: false }, { revoked: true });
  }

  // ── OTP codes (email verification / password reset) ──────────────────────────
  // Invalidate any outstanding codes of the same type before issuing a new one.
  async invalidateOtps(email, type) {
    await this.otpCodes.update(
      { email, type, consumedAt: null },
      { consumedAt: () => "now()" }
    );
  }

  async saveOtp(data) {
    return this.otpCodes.save(this.otpCodes.create(data));
  }

  async findActiveOtp(email, type, codeHash) {
    return this.otpCodes
      .createQueryBuilder("otp")
      .where("otp.email = :email", { email })
      .andWhere("otp.type = :type", { type })
      .andWhere("otp.code_hash = :codeHash", { codeHash })
      .andWhere("otp.consumed_at IS NULL")
      .andWhere("otp.expires_at > now()")
      .getOne();
  }

  async consumeOtp(id) {
    await this.otpCodes.update(id, { consumedAt: new Date() });
  }
}

module.exports = { AuthRepository };
