// modules/serviceDesk/tests/serviceDesk.spec.ts
// IT requests: the lifecycle table, form definitions and answers, the default
// catalog, and who gets to approve.
import {
  AGENT_CANCELLABLE,
  REQUESTER_CANCELLABLE,
  REQUEST_STATUSES,
  canTransition,
  assertTransition,
  formatReference,
  parseReference,
  statusOnSubmit,
  type RequestStatus,
} from "../domain/lifecycle";
import { formSchemaSchema, validateFormValues, type FormField } from "../domain/formSchema";
import { DEFAULT_CATALOG } from "../domain/defaultCatalog";
import { ServiceRequestService } from "../services/serviceRequest.service";

const { AppError } = require("../../../shared/errors/AppError");

describe("request lifecycle", () => {
  it("never lets work start before approval", () => {
    expect(canTransition("pending_approval", "in_progress")).toBe(false);
    expect(canTransition("rejected", "in_progress")).toBe(false);
    expect(canTransition("draft", "in_progress")).toBe(false);
    expect(canTransition("approved", "in_progress")).toBe(true);
    expect(canTransition("submitted", "in_progress")).toBe(true);
  });

  it("treats rejected, fulfilled and cancelled as final", () => {
    for (const end of ["rejected", "fulfilled", "cancelled"] as RequestStatus[]) {
      for (const to of REQUEST_STATUSES) expect({ end, to, ok: canTransition(end, to) }).toEqual({ end, to, ok: false });
    }
  });

  it("sends a submission to approval only when the item needs it", () => {
    expect(statusOnSubmit(true)).toBe("pending_approval");
    expect(statusOnSubmit(false)).toBe("submitted");
  });

  it("lets a requester withdraw only until IT starts, and IT cancel what reached it", () => {
    expect(REQUESTER_CANCELLABLE).not.toContain("in_progress");
    expect(AGENT_CANCELLABLE).toContain("in_progress");
    expect(AGENT_CANCELLABLE).not.toContain("draft");
    expect(AGENT_CANCELLABLE).not.toContain("pending_approval");
  });

  it("refuses an illegal move with a 409", () => {
    expect(() => assertTransition("fulfilled", "in_progress")).toThrow(AppError);
    try {
      assertTransition("fulfilled", "in_progress");
    } catch (e) {
      expect((e as { statusCode: number }).statusCode).toBe(409);
    }
  });

  it("formats and parses SR references", () => {
    expect(formatReference(123)).toBe("SR-000123");
    expect(parseReference("SR-000123")).toBe(123);
    expect(parseReference("sr-45")).toBe(45);
    expect(parseReference("45")).toBe(45);
    expect(parseReference("laptop")).toBeNull();
  });
});

describe("form definitions", () => {
  it("accepts every default catalog form", () => {
    for (const c of DEFAULT_CATALOG) {
      for (const item of c.items) {
        expect({ item: item.name, ok: formSchemaSchema.safeParse(item.formSchema).success }).toEqual({ item: item.name, ok: true });
      }
    }
  });

  it("covers the eight categories the stories name", () => {
    expect(DEFAULT_CATALOG.map((c) => c.key)).toEqual([
      "software_access",
      "hardware",
      "new_account",
      "password_reset",
      "business_application",
      "cloud_resource",
      "access_card",
      "it_solution",
    ]);
  });

  it("rejects duplicate keys, bad keys and choice fields without options", () => {
    expect(formSchemaSchema.safeParse([
      { key: "a", label: "A", type: "text" },
      { key: "a", label: "B", type: "text" },
    ]).success).toBe(false);
    expect(formSchemaSchema.safeParse([{ key: "Bad Key", label: "A", type: "text" }]).success).toBe(false);
    expect(formSchemaSchema.safeParse([{ key: "pick", label: "Pick", type: "select" }]).success).toBe(false);
  });

  it("never makes a checkbox required", () => {
    const parsed = formSchemaSchema.parse([{ key: "ok", label: "OK", type: "checkbox", required: true }]);
    expect(parsed[0].required).toBe(false);
  });
});

describe("form answers", () => {
  const schema: FormField[] = [
    { key: "software", label: "Software", type: "text", required: true },
    { key: "level", label: "Level", type: "select", required: true, options: ["Standard", "Admin"] },
    { key: "seats", label: "Seats", type: "number", required: false },
    { key: "needed_by", label: "Needed by", type: "date", required: false },
    { key: "systems", label: "Systems", type: "multiselect", required: false, options: ["Email", "VPN"] },
    { key: "urgent", label: "Urgent", type: "checkbox", required: false },
  ];

  it("keeps valid answers and drops keys the form doesn't have", () => {
    const { values, errors } = validateFormValues(schema, {
      software: "  Adobe Acrobat ",
      level: "Standard",
      seats: "2",
      needed_by: "2026-11-01",
      systems: ["Email", "Email"],
      urgent: true,
      removed_field: "x",
    });
    expect(errors).toEqual([]);
    expect(values).toEqual({
      software: "Adobe Acrobat",
      level: "Standard",
      seats: 2,
      needed_by: "2026-11-01",
      systems: ["Email"],
      urgent: true,
    });
  });

  it("requires required answers on submit but not on a draft", () => {
    expect(validateFormValues(schema, {}).errors.map((e) => e.field)).toEqual(["formValues.software", "formValues.level"]);
    expect(validateFormValues(schema, {}, { partial: true }).errors).toEqual([]);
  });

  it("rejects a wrong answer even on a draft", () => {
    const { errors } = validateFormValues(schema, { level: "Owner", seats: "many", needed_by: "soon" }, { partial: true });
    expect(errors.map((e) => e.field)).toEqual(["formValues.level", "formValues.seats", "formValues.needed_by"]);
  });
});

describe("who approves", () => {
  const person = (id: string) => ({ id, name: id, email: `${id}@example.com`, firstName: id });

  function serviceWith(holders: Record<string, string[]>) {
    const deskRepo = {
      usersWithPermission: jest.fn(async (_org: string, codes: string[]) => {
        const ids = new Set(codes.flatMap((c) => holders[c] ?? []));
        return [...ids].map(person);
      }),
    };
    return new ServiceRequestService({} as never, {} as never, deskRepo as never, {} as never, {} as never);
  }

  const item = (approverIds: string[], approvalMode: "none" | "approvers" = "approvers") => ({
    name: "Software licence",
    approvalMode,
    approverIds,
  });

  it("asks nobody when the item needs no approval", async () => {
    const svc = serviceWith({});
    await expect(svc.resolveApprovers("org-1", item(["mgr"], "none"), "req", null)).resolves.toEqual([]);
  });

  it("uses the item's named approvers, never the requester or the person it's for", async () => {
    const svc = serviceWith({ "servicerequest.create": ["mgr", "req", "colleague"] });
    const approvers = await svc.resolveApprovers("org-1", item(["mgr", "req", "colleague"]), "req", "colleague");
    expect(approvers.map((p) => p.id)).toEqual(["mgr"]);
  });

  it("falls back to the catalog managers when the item names nobody eligible", async () => {
    const svc = serviceWith({ "servicerequest.create": ["req"], "servicedesk.manage": ["admin", "req"] });
    const approvers = await svc.resolveApprovers("org-1", item(["req"]), "req", null);
    expect(approvers.map((p) => p.id)).toEqual(["admin"]);
  });

  it("refuses the submission rather than letting it skip approval", async () => {
    const svc = serviceWith({ "servicedesk.manage": ["req"] });
    await expect(svc.resolveApprovers("org-1", item([]), "req", null)).rejects.toMatchObject({ statusCode: 409 });
  });
});
