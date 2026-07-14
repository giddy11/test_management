// modules/clientCompany/tests/clientCompany.service.spec.ts

// Keep tests hermetic — never touch SMTP.
jest.mock("../../../shared/utils/mail/support.mail", () => ({
  sendSupporterInviteEmail: jest.fn().mockResolvedValue(undefined),
  sendSupportQueueAlertEmail: jest.fn().mockResolvedValue(undefined),
  sendSupportResolutionEmail: jest.fn().mockResolvedValue(undefined),
  sendFeedbackEscalatedAlertEmail: jest.fn().mockResolvedValue(undefined),
}));

import { ClientCompanyService } from "../services/clientCompany.service";

const { UserRole } = require("../../../config/constants");

function makeCompanyRepo() {
  return {
    fetchByProject: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    findByFeedbackToken: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
}

function makeProjectService() {
  return {
    getProject: jest
      .fn()
      .mockResolvedValue({ id: "proj-1", name: "Product A", organizationId: "org-1" }),
  };
}

function makeUserRepo() {
  return {
    findByEmail: jest.fn().mockResolvedValue(null),
    findById: jest.fn(),
    create: jest.fn(),
    softDelete: jest.fn(),
    findByClientCompany: jest.fn().mockResolvedValue([]),
    countByClientCompany: jest.fn().mockResolvedValue(0),
  };
}

const admin = { id: "admin-1", role: UserRole.ADMIN, organizationId: "org-1" };

const company = {
  id: "cc-1",
  projectId: "proj-1",
  name: "Client Co",
  contactEmail: null,
  feedbackToken: null,
  deletedAt: null,
};

describe("ClientCompanyService", () => {
  let companyRepo: any;
  let projectService: any;
  let userRepo: any;
  let service: ClientCompanyService;

  beforeEach(() => {
    companyRepo = makeCompanyRepo();
    projectService = makeProjectService();
    userRepo = makeUserRepo();
    service = new ClientCompanyService(companyRepo, projectService, userRepo);
  });

  describe("fetchCompanies", () => {
    it("checks project visibility and returns companies with supporter counts", async () => {
      companyRepo.fetchByProject.mockResolvedValue([company]);
      userRepo.countByClientCompany.mockResolvedValue(3);

      const rows = await service.fetchCompanies(admin, "proj-1");

      expect(projectService.getProject).toHaveBeenCalledWith(admin, "proj-1");
      expect(rows).toEqual([{ company, supporterCount: 3 }]);
    });
  });

  describe("deleteCompany", () => {
    it("blocks deletion while supporter accounts exist", async () => {
      companyRepo.findById.mockResolvedValue(company);
      userRepo.countByClientCompany.mockResolvedValue(2);

      await expect(service.deleteCompany(admin, "cc-1")).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(companyRepo.softDelete).not.toHaveBeenCalled();
    });

    it("soft-deletes once no supporters remain", async () => {
      companyRepo.findById.mockResolvedValue(company);
      userRepo.countByClientCompany.mockResolvedValue(0);

      await service.deleteCompany(admin, "cc-1");
      expect(companyRepo.softDelete).toHaveBeenCalledWith("cc-1");
    });

    it("404s on a missing or deleted company", async () => {
      companyRepo.findById.mockResolvedValue(null);
      await expect(service.deleteCompany(admin, "ghost")).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe("setFeedbackLink", () => {
    it("rotates a fresh token when enabling", async () => {
      companyRepo.findById.mockResolvedValue({ ...company });
      const { feedbackToken } = await service.setFeedbackLink(admin, "cc-1", true);
      expect(feedbackToken).toEqual(expect.any(String));
      expect(companyRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ feedbackToken })
      );
    });

    it("clears the token when disabling", async () => {
      companyRepo.findById.mockResolvedValue({ ...company, feedbackToken: "tok-1" });
      const { feedbackToken } = await service.setFeedbackLink(admin, "cc-1", false);
      expect(feedbackToken).toBeNull();
    });
  });

  describe("createSupporter", () => {
    const payload = {
      firstName: "Sam",
      lastName: "Support",
      email: "sam@client.co",
      password: "Password1",
    };

    it("creates an it_support account scoped to the company", async () => {
      companyRepo.findById.mockResolvedValue(company);
      userRepo.create.mockImplementation(async (d: any) => ({ id: "u-9", ...d }));

      const user = await service.createSupporter(admin, "cc-1", payload);

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          role: UserRole.IT_SUPPORT,
          clientCompanyId: "cc-1",
          organizationId: "org-1",
          companyName: "Client Co",
          isEmailVerified: true,
        })
      );
      expect(user.id).toBe("u-9");
    });

    it("409s on a duplicate email", async () => {
      companyRepo.findById.mockResolvedValue(company);
      userRepo.findByEmail.mockResolvedValue({ id: "existing" });

      await expect(service.createSupporter(admin, "cc-1", payload)).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  describe("removeSupporter", () => {
    it("404s when the target isn't a supporter of this company", async () => {
      companyRepo.findById.mockResolvedValue(company);
      userRepo.findById.mockResolvedValue({
        id: "u-1",
        role: UserRole.USER, // an internal user, not a supporter
        clientCompanyId: null,
        deletedAt: null,
      });

      await expect(service.removeSupporter(admin, "cc-1", "u-1")).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(userRepo.softDelete).not.toHaveBeenCalled();
    });

    it("soft-deletes a supporter belonging to the company", async () => {
      companyRepo.findById.mockResolvedValue(company);
      userRepo.findById.mockResolvedValue({
        id: "u-9",
        firstName: "Sam",
        lastName: "Support",
        role: UserRole.IT_SUPPORT,
        clientCompanyId: "cc-1",
        deletedAt: null,
      });

      await service.removeSupporter(admin, "cc-1", "u-9");
      expect(userRepo.softDelete).toHaveBeenCalledWith("u-9");
    });
  });
});
