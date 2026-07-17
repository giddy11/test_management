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
    findByEmail: jest.fn().mockResolvedValue(null),
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

function makeProjectRepo() {
  return {
    findById: jest
      .fn()
      .mockResolvedValue({ id: "proj-1", name: "Product A", organizationId: "org-1" }),
  };
}

function makeUserRepo() {
  return {
    findByEmail: jest.fn().mockResolvedValue(null),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
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
  let projectRepo: any;
  let service: ClientCompanyService;

  beforeEach(() => {
    companyRepo = makeCompanyRepo();
    projectService = makeProjectService();
    userRepo = makeUserRepo();
    projectRepo = makeProjectRepo();
    service = new ClientCompanyService(companyRepo, projectService, userRepo, projectRepo);
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

  describe("createCompany", () => {
    it("creates the company when the email is unused in the application", async () => {
      companyRepo.create.mockResolvedValue({ ...company, contactEmail: "a@b.com" });

      const created = await service.createCompany(admin, "proj-1", {
        name: "Client Co",
        contactEmail: "a@b.com",
      });

      expect(companyRepo.findByEmail).toHaveBeenCalledWith("a@b.com");
      expect(created.contactEmail).toBe("a@b.com");
    });

    it("409s when another company anywhere in the app already uses the email", async () => {
      companyRepo.findByEmail.mockResolvedValue({ ...company, id: "cc-2", projectId: "proj-2" });

      await expect(
        service.createCompany(admin, "proj-1", { name: "Client Co 2", contactEmail: "a@b.com" })
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(companyRepo.create).not.toHaveBeenCalled();
    });

    it("409s when the email already belongs to a user account", async () => {
      userRepo.findByEmail.mockResolvedValue({ id: "user-9" });

      await expect(
        service.createCompany(admin, "proj-1", { name: "Client Co", contactEmail: "staff@org.com" })
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(companyRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("updateCompany", () => {
    it("409s when renaming the email to one already used by another company", async () => {
      companyRepo.findById.mockResolvedValue(company);
      companyRepo.findByEmail.mockResolvedValue({ ...company, id: "cc-2", projectId: "proj-2" });

      await expect(
        service.updateCompany(admin, "cc-1", { contactEmail: "taken@b.com" })
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(companyRepo.update).not.toHaveBeenCalled();
    });

    it("allows saving when the email is unchanged", async () => {
      companyRepo.findById.mockResolvedValue({ ...company, contactEmail: "a@b.com" });

      await service.updateCompany(admin, "cc-1", { contactEmail: "a@b.com" });

      expect(companyRepo.findByEmail).not.toHaveBeenCalled();
      expect(companyRepo.update).toHaveBeenCalledWith("cc-1", { contactEmail: "a@b.com" });
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

    it("defaults isSupportLead to false when not provided", async () => {
      companyRepo.findById.mockResolvedValue(company);
      userRepo.create.mockImplementation(async (d: any) => ({ id: "u-9", ...d }));

      await service.createSupporter(admin, "cc-1", payload);

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isSupportLead: false })
      );
    });

    it("creates a lead supporter when isSupportLead is true", async () => {
      companyRepo.findById.mockResolvedValue(company);
      userRepo.create.mockImplementation(async (d: any) => ({ id: "u-9", ...d }));

      const user = await service.createSupporter(admin, "cc-1", { ...payload, isSupportLead: true });

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isSupportLead: true })
      );
      expect((user as any).isSupportLead).toBe(true);
    });
  });

  describe("last-lead protection", () => {
    it("409s demoting a company's only lead while other supporters remain", async () => {
      companyRepo.findById.mockResolvedValue(company);
      userRepo.findById.mockResolvedValue({
        id: "u-9",
        firstName: "Sam",
        lastName: "Support",
        role: UserRole.IT_SUPPORT,
        clientCompanyId: "cc-1",
        isSupportLead: true,
        deletedAt: null,
      });
      userRepo.findByClientCompany.mockResolvedValue([
        { id: "u-9", isSupportLead: true },
        { id: "u-10", isSupportLead: false },
      ]);

      await expect(service.setSupporterLead(admin, "cc-1", "u-9", false)).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(userRepo.update).not.toHaveBeenCalled();
    });

    it("409s removing a company's only lead while other supporters remain", async () => {
      companyRepo.findById.mockResolvedValue(company);
      userRepo.findById.mockResolvedValue({
        id: "u-9",
        firstName: "Sam",
        lastName: "Support",
        role: UserRole.IT_SUPPORT,
        clientCompanyId: "cc-1",
        isSupportLead: true,
        deletedAt: null,
      });
      userRepo.findByClientCompany.mockResolvedValue([
        { id: "u-9", isSupportLead: true },
        { id: "u-10", isSupportLead: false },
      ]);

      await expect(service.removeSupporter(admin, "cc-1", "u-9")).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(userRepo.softDelete).not.toHaveBeenCalled();
    });

    it("allows removing the only lead when they're also the last remaining supporter", async () => {
      companyRepo.findById.mockResolvedValue(company);
      userRepo.findById.mockResolvedValue({
        id: "u-9",
        firstName: "Sam",
        lastName: "Support",
        role: UserRole.IT_SUPPORT,
        clientCompanyId: "cc-1",
        isSupportLead: true,
        deletedAt: null,
      });
      userRepo.findByClientCompany.mockResolvedValue([{ id: "u-9", isSupportLead: true }]);

      await service.removeSupporter(admin, "cc-1", "u-9");
      expect(userRepo.softDelete).toHaveBeenCalledWith("u-9");
    });

    it("allows demoting a lead when another lead remains", async () => {
      companyRepo.findById.mockResolvedValue(company);
      userRepo.findById.mockResolvedValue({
        id: "u-9",
        firstName: "Sam",
        lastName: "Support",
        role: UserRole.IT_SUPPORT,
        clientCompanyId: "cc-1",
        isSupportLead: true,
        deletedAt: null,
      });
      userRepo.findByClientCompany.mockResolvedValue([
        { id: "u-9", isSupportLead: true },
        { id: "u-10", isSupportLead: true },
      ]);
      userRepo.update.mockResolvedValue({ id: "u-9", isSupportLead: false });

      await service.setSupporterLead(admin, "cc-1", "u-9", false);
      expect(userRepo.update).toHaveBeenCalledWith("u-9", { isSupportLead: false });
    });
  });

  describe("setSupporterLead", () => {
    it("404s when the target isn't a supporter of this company", async () => {
      companyRepo.findById.mockResolvedValue(company);
      userRepo.findById.mockResolvedValue({
        id: "u-1",
        role: UserRole.USER,
        clientCompanyId: null,
        deletedAt: null,
      });

      await expect(service.setSupporterLead(admin, "cc-1", "u-1", true)).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(userRepo.update).not.toHaveBeenCalled();
    });

    it("promotes a supporter to lead", async () => {
      companyRepo.findById.mockResolvedValue(company);
      userRepo.findById.mockResolvedValue({
        id: "u-9",
        firstName: "Sam",
        lastName: "Support",
        role: UserRole.IT_SUPPORT,
        clientCompanyId: "cc-1",
        deletedAt: null,
      });
      userRepo.update.mockResolvedValue({ id: "u-9", isSupportLead: true });

      const updated = await service.setSupporterLead(admin, "cc-1", "u-9", true);

      expect(userRepo.update).toHaveBeenCalledWith("u-9", { isSupportLead: true });
      expect((updated as any).isSupportLead).toBe(true);
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

  describe("supporter-roster self-service by an IT support lead", () => {
    const lead = {
      id: "sup-lead-1",
      role: UserRole.IT_SUPPORT,
      clientCompanyId: "cc-1",
      isSupportLead: true,
    };
    const nonLead = { ...lead, id: "sup-2", isSupportLead: false };
    const otherCompanyLead = { ...lead, id: "sup-3", clientCompanyId: "cc-2" };

    it("lets a company's own lead list its supporters", async () => {
      companyRepo.findById.mockResolvedValue(company);
      userRepo.findByClientCompany.mockResolvedValue([{ id: "u-9" }]);

      const rows = await service.listSupporters(lead, "cc-1");

      expect(rows).toEqual([{ id: "u-9" }]);
      // No project-access check runs for the self-service path.
      expect(projectService.getProject).not.toHaveBeenCalled();
    });

    it("lets a company's own lead create a supporter", async () => {
      companyRepo.findById.mockResolvedValue(company);
      userRepo.create.mockImplementation(async (d: any) => ({ id: "u-9", ...d }));

      const user = await service.createSupporter(lead, "cc-1", {
        firstName: "Sam",
        lastName: "Support",
        email: "sam@client.co",
        password: "Password1",
      });

      expect(projectRepo.findById).toHaveBeenCalledWith("proj-1");
      expect((user as any).id).toBe("u-9");
    });

    it("403s a non-lead supporter of the same company", async () => {
      await expect(service.listSupporters(nonLead, "cc-1")).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(companyRepo.findById).not.toHaveBeenCalled();
    });

    it("403s a lead trying to manage a different company's roster", async () => {
      await expect(service.listSupporters(otherCompanyLead, "cc-1")).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe("fetchMyCompany", () => {
    it("returns an IT support actor's own company with its supporter count", async () => {
      companyRepo.findById.mockResolvedValue(company);
      userRepo.countByClientCompany.mockResolvedValue(4);

      const result = await service.fetchMyCompany({
        id: "sup-1",
        role: UserRole.IT_SUPPORT,
        clientCompanyId: "cc-1",
      } as any);

      expect(companyRepo.findById).toHaveBeenCalledWith("cc-1");
      expect(result).toEqual({ company, supporterCount: 4 });
    });

    it("403s a non-it_support actor", async () => {
      await expect(service.fetchMyCompany(admin)).rejects.toMatchObject({ statusCode: 403 });
    });

    it("403s an it_support actor with no company assigned", async () => {
      await expect(
        service.fetchMyCompany({ id: "sup-1", role: UserRole.IT_SUPPORT, clientCompanyId: null } as any)
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });
});
