// modules/featureRequest/tests/featureRequest.service.spec.js
const { FeatureRequestService } = require("../services/featureRequest.service");

function makeFrRepo() {
  return {
    fetchPaginated: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    incrementCommentCount: jest.fn(),
    decrementCommentCount: jest.fn(),
  };
}

function makeVoteRepo() {
  return {
    votedSetForUser: jest.fn().mockResolvedValue(new Set()),
    toggle: jest.fn(),
  };
}

function makeCommentRepo() {
  return {
    fetchPaginated: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    softDelete: jest.fn(),
  };
}

function makeAuthRepo() {
  return {
    findByRole: jest.fn().mockResolvedValue([]),
    findUserById: jest.fn().mockResolvedValue(null),
  };
}

function makeNotificationService() {
  return {
    notifyNewFeatureRequest: jest.fn(),
    notifyFeatureRequestStatusChanged: jest.fn(),
    notifyFeatureRequestComment: jest.fn(),
  };
}

const admin = { id: "admin-1", role: "admin", organizationId: "org-1" };
const user = { id: "user-1", role: "user", organizationId: "org-1" };

const fr = {
  id: "fr-1",
  title: "Dark mode",
  description: "Please add dark mode",
  status: "new",
  category: null,
  submittedById: "user-1",
  organizationId: "org-1",
  upvoteCount: 0,
  commentCount: 0,
  adminResponse: null,
  deletedAt: null,
};

describe("FeatureRequestService", () => {
  let frRepo, voteRepo, commentRepo, authRepo, notificationService, service;

  beforeEach(() => {
    frRepo = makeFrRepo();
    voteRepo = makeVoteRepo();
    commentRepo = makeCommentRepo();
    authRepo = makeAuthRepo();
    notificationService = makeNotificationService();
    service = new FeatureRequestService(frRepo, voteRepo, commentRepo, authRepo, notificationService);
  });

  describe("fetchFeatureRequests", () => {
    it("annotates each row with hasVoted + the row's own denormalized commentCount", async () => {
      const withComments = { ...fr, commentCount: 3 };
      frRepo.fetchPaginated.mockResolvedValue({ data: [withComments], meta: { page: 1 } });
      voteRepo.votedSetForUser.mockResolvedValue(new Set(["fr-1"]));

      const result = await service.fetchFeatureRequests(user, { page: 1, limit: 20, sort: "top" });

      expect(result.data).toEqual([{ request: withComments, extra: { hasVoted: true, commentCount: 3 } }]);
    });
  });

  describe("getFeatureRequest", () => {
    it("throws 404 when missing", async () => {
      frRepo.findById.mockResolvedValue(null);
      await expect(service.getFeatureRequest(user, "fr-1")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("throws 404 when soft-deleted", async () => {
      frRepo.findById.mockResolvedValue({ ...fr, deletedAt: new Date() });
      await expect(service.getFeatureRequest(user, "fr-1")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("returns the request with vote/comment annotations", async () => {
      frRepo.findById.mockResolvedValue(fr);
      voteRepo.votedSetForUser.mockResolvedValue(new Set());
      const result = await service.getFeatureRequest(user, "fr-1");
      expect(result.request).toBe(fr);
      expect(result.extra).toEqual({ hasVoted: false, commentCount: 0 });
    });
  });

  describe("createFeatureRequest", () => {
    it("creates with status NEW, submittedById, and organizationId from the actor", async () => {
      frRepo.create.mockResolvedValue({ ...fr, id: "fr-2" });
      const created = await service.createFeatureRequest(user, {
        title: "Dark mode",
        description: "Please add dark mode",
      });
      expect(frRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "new",
          submittedById: "user-1",
          organizationId: "org-1",
        })
      );
      expect(created.id).toBe("fr-2");
    });
  });

  describe("updateStatus", () => {
    it("throws 404 when missing", async () => {
      frRepo.findById.mockResolvedValue(null);
      await expect(service.updateStatus(admin, "fr-1", { status: "planned" })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("patches status and sets statusUpdatedAt", async () => {
      frRepo.findById.mockResolvedValue(fr);
      frRepo.update.mockResolvedValue({ ...fr, status: "planned" });
      await service.updateStatus(admin, "fr-1", { status: "planned" });
      expect(frRepo.update).toHaveBeenCalledWith(
        "fr-1",
        expect.objectContaining({ status: "planned", statusUpdatedAt: expect.any(Date) })
      );
    });
  });

  describe("deleteFeatureRequest", () => {
    it("throws 404 when missing", async () => {
      frRepo.findById.mockResolvedValue(null);
      await expect(service.deleteFeatureRequest(admin, "fr-1")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("soft-deletes after existence check", async () => {
      frRepo.findById.mockResolvedValue(fr);
      await service.deleteFeatureRequest(admin, "fr-1");
      expect(frRepo.softDelete).toHaveBeenCalledWith("fr-1");
    });
  });

  describe("toggleVote", () => {
    it("throws 404 when the request is missing", async () => {
      frRepo.findById.mockResolvedValue(null);
      await expect(service.toggleVote(user, "fr-1")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("delegates to the vote repository's atomic toggle", async () => {
      frRepo.findById.mockResolvedValue(fr);
      voteRepo.toggle.mockResolvedValue({ voted: true, upvoteCount: 1 });
      const result = await service.toggleVote(user, "fr-1");
      expect(voteRepo.toggle).toHaveBeenCalledWith("fr-1", "user-1");
      expect(result).toEqual({ voted: true, upvoteCount: 1 });
    });
  });

  describe("addComment", () => {
    it("throws 404 when the request is missing", async () => {
      frRepo.findById.mockResolvedValue(null);
      await expect(service.addComment(user, "fr-1", "hello")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("creates the comment tied to the request and actor, and bumps the denormalized count", async () => {
      frRepo.findById.mockResolvedValue(fr);
      authRepo.findUserById.mockResolvedValue({ id: "admin-1", firstName: "Ada", lastName: "Min" });
      commentRepo.create.mockResolvedValue({ id: "c-1", body: "hello" });

      const result = await service.addComment(admin, "fr-1", "hello");

      expect(commentRepo.create).toHaveBeenCalledWith({
        featureRequestId: "fr-1",
        authorId: "admin-1",
        authorName: "Ada Min",
        body: "hello",
      });
      expect(frRepo.incrementCommentCount).toHaveBeenCalledWith("fr-1");
      expect(result).toEqual({ id: "c-1", body: "hello" });
    });
  });

  describe("deleteComment", () => {
    const comment = { id: "c-1", featureRequestId: "fr-1", authorId: "user-1", deletedAt: null };

    it("throws 404 when the comment is missing", async () => {
      commentRepo.findById.mockResolvedValue(null);
      await expect(service.deleteComment(user, "fr-1", "c-1")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("throws 404 when the comment belongs to a different request", async () => {
      commentRepo.findById.mockResolvedValue({ ...comment, featureRequestId: "fr-2" });
      await expect(service.deleteComment(user, "fr-1", "c-1")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("allows the comment author to delete it and decrements the denormalized count", async () => {
      commentRepo.findById.mockResolvedValue(comment);
      await service.deleteComment(user, "fr-1", "c-1");
      expect(commentRepo.softDelete).toHaveBeenCalledWith("c-1");
      expect(frRepo.decrementCommentCount).toHaveBeenCalledWith("fr-1");
    });

    it("allows an admin to delete someone else's comment", async () => {
      commentRepo.findById.mockResolvedValue(comment);
      await service.deleteComment(admin, "fr-1", "c-1");
      expect(commentRepo.softDelete).toHaveBeenCalledWith("c-1");
    });

    it("forbids a non-author, non-admin from deleting it", async () => {
      commentRepo.findById.mockResolvedValue(comment);
      const other = { id: "other-1", role: "user", organizationId: "org-1" };
      await expect(service.deleteComment(other, "fr-1", "c-1")).rejects.toMatchObject({ statusCode: 403 });
      expect(frRepo.decrementCommentCount).not.toHaveBeenCalled();
    });
  });
});
