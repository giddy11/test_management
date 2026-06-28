// modules/auth/tests/auth.service.spec.js
// Mailer is mocked so tests never hit SMTP.
jest.mock("../../../shared/utils/mailer", () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

const { AuthService } = require("../services/auth.service");
const { AppError } = require("../../../shared/errors/AppError");
const { hashPassword, hashToken } = require("../../../shared/utils/password");
const { signRefreshToken } = require("../../../shared/utils/jwt");
const { UserRole, AuthProvider, OtpType } = require("../../../config/constants");

function makeRepo() {
  return {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
    findUserByEmailWithPassword: jest.fn(),
    findUserByGoogleId: jest.fn(),
    createUser: jest.fn(),
    updateUser: jest.fn(),
    saveRefreshToken: jest.fn().mockResolvedValue({ id: "rt-new" }),
    findActiveRefreshToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
    revokeAllForUser: jest.fn(),
    invalidateOtps: jest.fn().mockResolvedValue(undefined),
    saveOtp: jest.fn().mockResolvedValue({ id: "otp-1" }),
    findActiveOtp: jest.fn(),
    consumeOtp: jest.fn(),
  };
}

const baseUser = {
  id: "user-1",
  firstName: "Gideon",
  lastName: "Edoghotu",
  companyName: "Acme Inc",
  email: "gid@example.com",
  role: UserRole.ADMIN,
  provider: AuthProvider.LOCAL,
  isEmailVerified: false,
};

const registerInput = {
  firstName: "Gideon",
  lastName: "Edoghotu",
  companyName: "Acme Inc",
  email: "gid@example.com",
  password: "Passw0rd",
  city: "Lagos",
  country: "Nigeria",
};

describe("AuthService", () => {
  let repo;
  let service;

  beforeEach(() => {
    repo = makeRepo();
    service = new AuthService(repo);
  });

  // ── register ────────────────────────────────────────────────────────────────
  describe("register", () => {
    it("creates an unverified user, hashes the password, and emails a code", async () => {
      repo.findUserByEmail.mockResolvedValue(null);
      repo.createUser.mockImplementation(async (data) => ({ ...baseUser, ...data }));

      const result = await service.register(registerInput);

      const created = repo.createUser.mock.calls[0][0];
      expect(created.firstName).toBe("Gideon");
      expect(created.lastName).toBe("Edoghotu");
      expect(created.companyName).toBe("Acme Inc");
      expect(created.city).toBe("Lagos");
      expect(created.password).not.toBe("Passw0rd"); // hashed
      expect(created.isEmailVerified).toBe(false);
      expect(repo.saveOtp).toHaveBeenCalledTimes(1); // verification code issued
      expect(repo.invalidateOtps).toHaveBeenCalledWith(baseUser.email, OtpType.VERIFY_EMAIL);
      expect(result.tokens.accessToken).toEqual(expect.any(String));
    });

    it("throws 409 when the email already exists", async () => {
      repo.findUserByEmail.mockResolvedValue(baseUser);
      await expect(service.register(registerInput)).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(repo.createUser).not.toHaveBeenCalled();
    });
  });

  // ── verify email ──────────────────────────────────────────────────────────────
  describe("verifyEmail", () => {
    it("consumes a valid code and marks the user verified", async () => {
      repo.findUserByEmail.mockResolvedValue({ ...baseUser });
      repo.findActiveOtp.mockResolvedValue({ id: "otp-9" });
      repo.updateUser.mockResolvedValue({ ...baseUser, isEmailVerified: true });

      const user = await service.verifyEmail({ email: baseUser.email, code: "123456" });

      expect(repo.findActiveOtp).toHaveBeenCalledWith(
        baseUser.email,
        OtpType.VERIFY_EMAIL,
        hashToken("123456")
      );
      expect(repo.consumeOtp).toHaveBeenCalledWith("otp-9");
      expect(user.isEmailVerified).toBe(true);
    });

    it("throws 400 for an invalid/expired code", async () => {
      repo.findUserByEmail.mockResolvedValue({ ...baseUser });
      repo.findActiveOtp.mockResolvedValue(null);
      await expect(
        service.verifyEmail({ email: baseUser.email, code: "000000" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("is idempotent when already verified", async () => {
      repo.findUserByEmail.mockResolvedValue({ ...baseUser, isEmailVerified: true });
      const user = await service.verifyEmail({ email: baseUser.email, code: "123456" });
      expect(user.isEmailVerified).toBe(true);
      expect(repo.findActiveOtp).not.toHaveBeenCalled();
    });
  });

  describe("resendVerification", () => {
    it("issues a new code for an unverified account", async () => {
      repo.findUserByEmail.mockResolvedValue({ ...baseUser, isEmailVerified: false });
      await service.resendVerification({ email: baseUser.email });
      expect(repo.saveOtp).toHaveBeenCalledTimes(1);
    });

    it("does nothing for a verified or unknown account", async () => {
      repo.findUserByEmail.mockResolvedValue({ ...baseUser, isEmailVerified: true });
      await service.resendVerification({ email: baseUser.email });
      repo.findUserByEmail.mockResolvedValue(null);
      await service.resendVerification({ email: "nope@example.com" });
      expect(repo.saveOtp).not.toHaveBeenCalled();
    });
  });

  // ── login ────────────────────────────────────────────────────────────────────
  describe("login", () => {
    it("returns tokens for valid credentials", async () => {
      const password = await hashPassword("Passw0rd");
      repo.findUserByEmailWithPassword.mockResolvedValue({ ...baseUser, password });
      const result = await service.login({ email: baseUser.email, password: "Passw0rd" });
      expect(result.tokens.accessToken).toEqual(expect.any(String));
    });

    it("throws 401 on wrong password", async () => {
      const password = await hashPassword("Passw0rd");
      repo.findUserByEmailWithPassword.mockResolvedValue({ ...baseUser, password });
      await expect(
        service.login({ email: baseUser.email, password: "wrong" })
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it("throws 401 when the user does not exist", async () => {
      repo.findUserByEmailWithPassword.mockResolvedValue(null);
      await expect(
        service.login({ email: "nope@example.com", password: "Passw0rd" })
      ).rejects.toBeInstanceOf(AppError);
    });

    it("throws 401 for an OAuth-only account (no password)", async () => {
      repo.findUserByEmailWithPassword.mockResolvedValue({ ...baseUser, password: null });
      await expect(
        service.login({ email: baseUser.email, password: "Passw0rd" })
      ).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  // ── refresh ──────────────────────────────────────────────────────────────────
  describe("refresh", () => {
    it("rotates the token: revokes the old record and issues a new pair", async () => {
      const token = signRefreshToken({ id: "user-1" });
      repo.findActiveRefreshToken.mockResolvedValue({ id: "rt-old" });
      repo.findUserById.mockResolvedValue(baseUser);

      const result = await service.refresh({ refreshToken: token });

      expect(repo.revokeRefreshToken).toHaveBeenCalledWith("rt-old");
      expect(result.tokens.accessToken).toEqual(expect.any(String));
    });

    it("throws 401 on a malformed refresh token", async () => {
      await expect(
        service.refresh({ refreshToken: "not-a-jwt" })
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it("throws 401 when there is no active DB record", async () => {
      const token = signRefreshToken({ id: "user-1" });
      repo.findActiveRefreshToken.mockResolvedValue(null);
      await expect(
        service.refresh({ refreshToken: token })
      ).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  // ── logout ───────────────────────────────────────────────────────────────────
  describe("logout", () => {
    it("revokes the matching refresh-token record", async () => {
      const token = signRefreshToken({ id: "user-1" });
      repo.findActiveRefreshToken.mockResolvedValue({ id: "rt-1" });
      await service.logout({ refreshToken: token });
      expect(repo.revokeRefreshToken).toHaveBeenCalledWith("rt-1");
    });

    it("is a no-op (no throw) for an invalid token", async () => {
      await expect(service.logout({ refreshToken: "garbage" })).resolves.toBeUndefined();
      expect(repo.revokeRefreshToken).not.toHaveBeenCalled();
    });
  });

  // ── forgot / reset password ────────────────────────────────────────────────────
  describe("forgotPassword", () => {
    it("issues a reset code for a local account", async () => {
      repo.findUserByEmail.mockResolvedValue({ ...baseUser, provider: AuthProvider.LOCAL });
      await service.forgotPassword({ email: baseUser.email });
      expect(repo.invalidateOtps).toHaveBeenCalledWith(baseUser.email, OtpType.RESET_PASSWORD);
      expect(repo.saveOtp).toHaveBeenCalledTimes(1);
    });

    it("does nothing (no leak) for an unknown email", async () => {
      repo.findUserByEmail.mockResolvedValue(null);
      await expect(service.forgotPassword({ email: "ghost@example.com" })).resolves.toBeUndefined();
      expect(repo.saveOtp).not.toHaveBeenCalled();
    });
  });

  describe("resetPassword", () => {
    it("updates the password, consumes the code, and revokes sessions", async () => {
      repo.findUserByEmail.mockResolvedValue({ ...baseUser });
      repo.findActiveOtp.mockResolvedValue({ id: "otp-r" });

      await service.resetPassword({
        email: baseUser.email,
        code: "654321",
        newPassword: "NewPass1",
      });

      expect(repo.consumeOtp).toHaveBeenCalledWith("otp-r");
      const patch = repo.updateUser.mock.calls[0][1];
      expect(patch.password).toEqual(expect.any(String));
      expect(patch.password).not.toBe("NewPass1"); // hashed
      expect(repo.revokeAllForUser).toHaveBeenCalledWith("user-1");
    });

    it("throws 400 for an invalid code", async () => {
      repo.findUserByEmail.mockResolvedValue({ ...baseUser });
      repo.findActiveOtp.mockResolvedValue(null);
      await expect(
        service.resetPassword({ email: baseUser.email, code: "000000", newPassword: "NewPass1" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ── google sign in ─────────────────────────────────────────────────────────────
  describe("google", () => {
    function stubGoogle(payload) {
      service.googleClient = {
        verifyIdToken: jest.fn().mockResolvedValue({ getPayload: () => payload }),
      };
    }

    it("creates a verified user from a Google token", async () => {
      stubGoogle({
        sub: "g-123",
        email: "new@example.com",
        email_verified: true,
        given_name: "New",
        family_name: "User",
        picture: "http://pic",
      });
      repo.findUserByGoogleId.mockResolvedValue(null);
      repo.findUserByEmail.mockResolvedValue(null);
      repo.createUser.mockImplementation(async (d) => ({ ...baseUser, ...d, id: "user-2" }));

      await service.google({ idToken: "valid" });

      const created = repo.createUser.mock.calls[0][0];
      expect(created.provider).toBe(AuthProvider.GOOGLE);
      expect(created.googleId).toBe("g-123");
      expect(created.firstName).toBe("New");
      expect(created.password).toBeNull();
      expect(created.isEmailVerified).toBe(true);
    });

    it("links Google to an existing local account by email", async () => {
      stubGoogle({ sub: "g-123", email: baseUser.email, email_verified: true });
      repo.findUserByGoogleId.mockResolvedValue(null);
      repo.findUserByEmail.mockResolvedValue({ ...baseUser, googleId: null });
      repo.updateUser.mockResolvedValue({ ...baseUser, googleId: "g-123" });

      await service.google({ idToken: "valid" });

      expect(repo.updateUser).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ googleId: "g-123", isEmailVerified: true })
      );
      expect(repo.createUser).not.toHaveBeenCalled();
    });

    it("throws 401 when the Google email is not verified", async () => {
      stubGoogle({ sub: "g-1", email: "x@example.com", email_verified: false });
      await expect(service.google({ idToken: "valid" })).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it("throws 401 when token verification fails", async () => {
      service.googleClient = {
        verifyIdToken: jest.fn().mockRejectedValue(new Error("bad token")),
      };
      await expect(service.google({ idToken: "bad" })).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it("throws 503 when Google Sign In is not configured", async () => {
      service.googleClient = null;
      await expect(service.google({ idToken: "x" })).rejects.toMatchObject({
        statusCode: 503,
      });
    });
  });
});
