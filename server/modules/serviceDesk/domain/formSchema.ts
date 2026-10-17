// modules/serviceDesk/domain/formSchema.ts
// Each catalog item carries its own form: a JSON list of fields an
// administrator builds in Catalog setup. This file is the whole contract —
// what a valid form definition is, and whether a request's answers fit it.
// Pure, so the client's form builder and the server agree by test, not hope.
import { z } from "zod";

export const FIELD_TYPES = ["text", "textarea", "number", "date", "select", "multiselect", "checkbox"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  helpText?: string | null;
}

export type FormValue = string | number | boolean | string[];
export type FormValues = Record<string, FormValue>;

export interface FieldError {
  field: string;
  message: string;
}

export const MAX_FIELDS = 30;
const TEXT_MAX = 2000;
const TEXTAREA_MAX = 5000;

const formFieldSchema = z
  .object({
    // Stable identifier the answers are stored under — lowercase snake_case so
    // it survives a label being reworded.
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{0,39}$/, "Use lowercase letters, numbers and underscores, starting with a letter"),
    label: z.string().trim().min(1, "Every field needs a label").max(120),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().default(false),
    options: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    helpText: z.string().trim().max(300).nullish(),
  })
  .superRefine((f, ctx) => {
    const choice = f.type === "select" || f.type === "multiselect";
    if (choice && (!f.options || f.options.length < 1)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "A choice field needs at least one option" });
    }
    if (choice && f.options && new Set(f.options).size !== f.options.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Options must be unique" });
    }
  })
  .transform((f): FormField => {
    const choice = f.type === "select" || f.type === "multiselect";
    return {
      key: f.key,
      label: f.label,
      type: f.type,
      // A checkbox can't sensibly be "required" — unticked is an answer.
      required: f.type === "checkbox" ? false : f.required,
      ...(choice ? { options: f.options } : {}),
      helpText: f.helpText || null,
    };
  });

export const formSchemaSchema = z
  .array(formFieldSchema)
  .max(MAX_FIELDS, `A form can have at most ${MAX_FIELDS} fields`)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((f, i) => {
      if (seen.has(f.key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, "key"], message: `Two fields share the key "${f.key}"` });
      }
      seen.add(f.key);
    });
  });

const isBlank = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

// Checks a request's answers against the item's form. Unknown keys are dropped
// (a field the admin has since removed), blanks are omitted, and `partial`
// (a draft) skips the required check but still rejects a wrong-typed answer.
export function validateFormValues(
  schema: FormField[],
  input: unknown,
  { partial = false }: { partial?: boolean } = {}
): { values: FormValues; errors: FieldError[] } {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const values: FormValues = {};
  const errors: FieldError[] = [];
  const fail = (f: FormField, message: string) => errors.push({ field: `formValues.${f.key}`, message });

  for (const f of schema) {
    const v = raw[f.key];
    if (isBlank(v)) {
      if (f.required && !partial) fail(f, `${f.label} is required`);
      continue;
    }
    switch (f.type) {
      case "text":
      case "textarea": {
        if (typeof v !== "string") { fail(f, `${f.label} must be text`); break; }
        const max = f.type === "text" ? TEXT_MAX : TEXTAREA_MAX;
        if (v.length > max) { fail(f, `${f.label} must be at most ${max} characters`); break; }
        values[f.key] = v.trim();
        break;
      }
      case "number": {
        const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
        if (!Number.isFinite(n)) { fail(f, `${f.label} must be a number`); break; }
        values[f.key] = n;
        break;
      }
      case "date": {
        if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
          fail(f, `${f.label} must be a date`);
          break;
        }
        values[f.key] = v;
        break;
      }
      case "select": {
        if (typeof v !== "string" || !f.options?.includes(v)) { fail(f, `Choose one of the options for ${f.label}`); break; }
        values[f.key] = v;
        break;
      }
      case "multiselect": {
        if (!Array.isArray(v) || v.some((o) => typeof o !== "string" || !f.options?.includes(o))) {
          fail(f, `Choose from the options for ${f.label}`);
          break;
        }
        values[f.key] = [...new Set(v as string[])];
        break;
      }
      case "checkbox": {
        if (typeof v !== "boolean") { fail(f, `${f.label} must be ticked or unticked`); break; }
        values[f.key] = v;
        break;
      }
    }
  }
  return { values, errors };
}
