// modules/liveChat/tests/liveChatLink.service.spec.js
//
// Rotating a project's widget link breaks every embedded copy of the widget, so
// it is the project's team lead's call — decided by role in the project, not by
// a platform permission. setWidgetLink used to check project access only.
const { LiveChatService } = require("../services/liveChat.service");

function build({ canManage }) {
  const project = { id: "proj-1", liveChatToken: null };
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
  const service = Object.create(LiveChatService.prototype);
  service.projectService = projectService;
  service.projectRepo = projectRepo;
  return { service, projectRepo };
}

const actor = { id: "u-1", organizationId: "org-1", permissions: new Set(["project.read"]) };

describe("LiveChatService.setWidgetLink", () => {
  it("lets the team lead enable the widget link", async () => {
    const { service, projectRepo } = build({ canManage: true });
    const res = await service.setWidgetLink(actor, "proj-1", true);
    expect(res.liveChatToken).toEqual(expect.any(String));
    expect(projectRepo.save).toHaveBeenCalled();
  });

  it("stops an ordinary project member rotating it", async () => {
    const { service, projectRepo } = build({ canManage: false });
    await expect(service.setWidgetLink(actor, "proj-1", true)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(projectRepo.save).not.toHaveBeenCalled();
  });
});
