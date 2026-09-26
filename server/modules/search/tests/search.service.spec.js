// modules/search/tests/search.service.spec.js
const { SearchService } = require("../services/search.service");
const { toSearchResultResponse } = require("../dto/search.dto");
const { permissionsFor } = require("../../../test/actors");

function makeSearchRepo() {
  return { search: jest.fn().mockResolvedValue([]) };
}

const admin = {
  id: "admin-1",
  role: "admin",
  permissions: permissionsFor("admin"),
  organizationId: "org-1",
};
const plainUser = {
  id: "u-1",
  role: "user",
  permissions: permissionsFor("user"),
  organizationId: "org-1",
};
const supporter = {
  id: "s-1",
  role: "it_support",
  permissions: permissionsFor("it_support"),
  organizationId: "org-1",
  clientCompanyId: "cc-1",
};

describe("SearchService", () => {
  let searchRepo;
  let service;

  beforeEach(() => {
    searchRepo = makeSearchRepo();
    service = new SearchService(searchRepo);
  });

  describe("scoping", () => {
    it("searches only the actor's organisation", async () => {
      await service.search(admin, { q: "login" });
      expect(searchRepo.search).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1" })
      );
    });

    it("restricts a plain user to their own projects", async () => {
      await service.search(plainUser, { q: "login" });
      expect(searchRepo.search).toHaveBeenCalledWith(
        expect.objectContaining({ restrictedUserId: "u-1" })
      );
    });

    it("does not restrict an actor with org-wide project read", async () => {
      await service.search(admin, { q: "login" });
      expect(searchRepo.search).toHaveBeenCalledWith(
        expect.objectContaining({ restrictedUserId: null })
      );
    });

    it("refuses an external supporter — they have no project surface", async () => {
      await expect(service.search(supporter, { q: "login" })).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(searchRepo.search).not.toHaveBeenCalled();
    });

    it("returns nothing, and queries nothing, for an actor with no organisation", async () => {
      const orphan = { ...admin, organizationId: null };
      await expect(service.search(orphan, { q: "login" })).resolves.toEqual([]);
      expect(searchRepo.search).not.toHaveBeenCalled();
    });
  });

  describe("the term", () => {
    it("ignores a term shorter than two characters", async () => {
      await expect(service.search(admin, { q: "a" })).resolves.toEqual([]);
      await expect(service.search(admin, { q: "   " })).resolves.toEqual([]);
      expect(searchRepo.search).not.toHaveBeenCalled();
    });

    it("trims the term before searching", async () => {
      await service.search(admin, { q: "  login  " });
      expect(searchRepo.search).toHaveBeenCalledWith(
        expect.objectContaining({ term: "login" })
      );
    });

    it("turns a bug reference code into an exact number lookup", async () => {
      await service.search(admin, { q: "BF-20260728-014" });
      expect(searchRepo.search).toHaveBeenCalledWith(
        expect.objectContaining({ bugNumber: 14, ticketNumber: null })
      );
    });

    it("turns a ticket reference code into an exact number lookup", async () => {
      await service.search(admin, { q: "TKT-042" });
      expect(searchRepo.search).toHaveBeenCalledWith(
        expect.objectContaining({ ticketNumber: 42, bugNumber: null })
      );
    });

    it("caps the limit", async () => {
      await service.search(admin, { q: "login", limit: 500 });
      expect(searchRepo.search).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });
  });
});

describe("toSearchResultResponse", () => {
  const base = {
    id: "id-1",
    title: "Checkout fails",
    reference: null,
    number: null,
    project_id: "proj-1",
    project_name: "Storefront",
    suite_id: null,
    context: null,
    created_at: new Date("2026-07-28T00:00:00Z"),
    rank: 1,
  };

  it("builds a bug's reference code from its number and creation date", () => {
    const out = toSearchResultResponse({ ...base, type: "bug", number: 14 });
    expect(out.reference).toBe("BF-20260728-014");
  });

  it("builds a ticket's reference code with the ticket prefix", () => {
    const out = toSearchResultResponse({ ...base, type: "ticket", number: 42 });
    expect(out.reference).toBe("TKT-20260728-042");
  });

  it("passes a test case's external id through as its reference", () => {
    const out = toSearchResultResponse({ ...base, type: "case", reference: "JIRA-77" });
    expect(out.reference).toBe("JIRA-77");
  });

  it("leaves a project's reference null", () => {
    const out = toSearchResultResponse({ ...base, type: "project" });
    expect(out.reference).toBeNull();
  });
});
