// modules/feedback/tests/feedbackLink.service.spec.js
//
// Enabling or disabling a project's public form link is the project's team
// lead's call. setFeedbackLink used to check project ACCESS only and lean on
// a route guard for the rest; with authorisation now decided by role in the
// project, the service must hold the line itself. The token itself is
// permanent once minted (see setFeedbackLink's own comment): toggling only
// flips feedbackEnabled, so re-enabling never orphans a copy already shared.
const { FeedbackService } = require("../services/feedback.service");

function build({ canManage }) {
  const project = { id: "proj-1", feedbackToken: null };
  const projectRepo = { save: jest.fn().mockImplementation(async (p) => p) };
  const projectService = {
    getProject: jest.fn().mockResolvedValue(project),
    assertCanManageProject: jest.fn().mockImplementation(async () => {
      if (!canManage) {
        throw Object.assign(
          new Error("Only this project's team lead or an administrator can do this"),
          { statusCode: 403 }
        );
      }
    }),
  };
  // Only the two collaborators the method touches; the rest of the constructor
  // is irrelevant here.
  const service = Object.create(FeedbackService.prototype);
  service.projectService = projectService;
  service.projectRepo = projectRepo;
  return { service, project, projectRepo, projectService };
}

const actor = { id: "u-1", organizationId: "org-1", permissions: new Set(["project.read"]) };

describe("FeedbackService.setFeedbackLink", () => {
  it("lets the project's team lead enable the link", async () => {
    const { service, projectRepo } = build({ canManage: true });
    const res = await service.setFeedbackLink(actor, "proj-1", true);
    expect(res.feedbackToken).toEqual(expect.any(String));
    expect(projectRepo.save).toHaveBeenCalled();
  });

  it("lets the lead disable it, clearing the token", async () => {
    const { service } = build({ canManage: true });
    await expect(service.setFeedbackLink(actor, "proj-1", false)).resolves.toEqual({
      feedbackToken: null,
    });
  });

  it("stops an ordinary project member enabling the link", async () => {
    const { service, projectRepo } = build({ canManage: false });
    await expect(service.setFeedbackLink(actor, "proj-1", true)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(projectRepo.save).not.toHaveBeenCalled();
  });

  it("keeps the same token across a disable and re-enable", async () => {
    const { service } = build({ canManage: true });
    const first = await service.setFeedbackLink(actor, "proj-1", true);
    const disabled = await service.setFeedbackLink(actor, "proj-1", false);
    const second = await service.setFeedbackLink(actor, "proj-1", true);
    expect(disabled.feedbackToken).toBeNull();
    expect(second.feedbackToken).toBe(first.feedbackToken);
  });

  it("checks access to the project before checking authority to manage it", async () => {
    const { service, projectService } = build({ canManage: true });
    projectService.getProject.mockRejectedValue(
      Object.assign(new Error("You do not have access to this project"), { statusCode: 403 })
    );
    await expect(service.setFeedbackLink(actor, "proj-1", true)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(projectService.assertCanManageProject).not.toHaveBeenCalled();
  });
});
