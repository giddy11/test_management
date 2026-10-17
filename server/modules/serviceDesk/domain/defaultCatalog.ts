// modules/serviceDesk/domain/defaultCatalog.ts
// What a new organisation's catalog starts with: the eight categories the
// user stories name, each with one starter item an administrator can edit,
// switch off or copy. Seeded the first time anyone opens the catalog (there
// is no organisations table to seed against at migration time).
//
// Starter items that cost money or grant access ask for approval. They name no
// approvers, so until an administrator picks some, the decision falls to
// whoever holds servicedesk.manage (see ServiceRequestService.resolveApprovers).
import type { ApprovalMode, RiskLevel } from "./lifecycle";
import type { FormField } from "./formSchema";

export interface DefaultItem {
  name: string;
  description: string;
  approvalMode: ApprovalMode;
  riskLevel: RiskLevel;
  requiresIdentityCheck?: boolean;
  formSchema: FormField[];
}

export interface DefaultCategory {
  key: string;
  name: string;
  description: string;
  icon: string; // a lucide icon name the client maps; unknown names fall back
  items: DefaultItem[];
}

// IT reads the answer under this key as the date to beat (see domain/neededBy.ts).
export const NEEDED_BY_HELP = "When do you need this by? IT will try to have it ready before then.";
const neededBy: FormField = { key: "needed_by", label: "Needed by", type: "date", required: false, helpText: NEEDED_BY_HELP };

export const DEFAULT_CATALOG: DefaultCategory[] = [
  {
    key: "software_access",
    name: "Software access",
    description: "Licences and access to software you need for your work.",
    icon: "app-window",
    items: [
      {
        name: "Software licence or access",
        description: "Ask for a software licence, or access to software that's already installed.",
        approvalMode: "approvers",
        riskLevel: "medium",
        formSchema: [
          { key: "software", label: "Which software?", type: "text", required: true, helpText: "For example: Adobe Acrobat Pro, Figma, Visual Studio" },
          { key: "access_level", label: "Access level", type: "select", required: true, options: ["Standard user", "Administrator"], helpText: null },
          neededBy,
        ],
      },
    ],
  },
  {
    key: "hardware",
    name: "Hardware",
    description: "Laptops, monitors, phones and accessories.",
    icon: "laptop",
    items: [
      {
        name: "Request hardware",
        description: "A new or replacement device or accessory.",
        approvalMode: "approvers",
        riskLevel: "medium",
        formSchema: [
          { key: "item_type", label: "What do you need?", type: "select", required: true, options: ["Laptop", "Monitor", "Keyboard and mouse", "Headset", "Mobile phone", "Docking station", "Other"], helpText: null },
          { key: "replacement", label: "This replaces a broken or lost device", type: "checkbox", required: false, helpText: null },
          { key: "details", label: "Details", type: "textarea", required: false, helpText: "Model, size or anything IT should know" },
          neededBy,
        ],
      },
    ],
  },
  {
    key: "new_account",
    name: "New accounts",
    description: "Accounts for a new starter, or a new system account for you.",
    icon: "user-plus",
    items: [
      {
        name: "New starter accounts",
        description: "Set up accounts for someone joining. Use 'Requested for' to name them.",
        approvalMode: "approvers",
        riskLevel: "medium",
        formSchema: [
          { key: "start_date", label: "Start date", type: "date", required: true, helpText: null },
          { key: "job_title", label: "Job title", type: "text", required: true, helpText: null },
          { key: "department", label: "Department", type: "text", required: false, helpText: null },
          { key: "systems", label: "Systems they need", type: "multiselect", required: true, options: ["Email", "VPN", "HR system", "Finance system", "CRM", "Shared drives"], helpText: null },
        ],
      },
    ],
  },
  {
    key: "password_reset",
    name: "Password resets",
    description: "Locked out, or need a password reset.",
    icon: "key-round",
    items: [
      {
        name: "Password reset or account unlock",
        description: "IT will confirm who you are before resetting anything. A new password is never sent in this request.",
        approvalMode: "none",
        riskLevel: "low",
        // BR 1.5: IT confirms who is asking before resetting anything.
        requiresIdentityCheck: true,
        formSchema: [
          { key: "system", label: "Which account?", type: "select", required: true, options: ["Email / Microsoft 365", "Laptop sign-in", "VPN", "Business application", "Other"], helpText: null },
          { key: "locked_out", label: "The account is locked", type: "checkbox", required: false, helpText: null },
        ],
      },
    ],
  },
  {
    key: "business_application",
    name: "Business applications",
    description: "Access to the systems the business runs on.",
    icon: "briefcase",
    items: [
      {
        name: "Access to a business application",
        description: "For example the CRM, HR, finance or reporting systems.",
        approvalMode: "approvers",
        riskLevel: "medium",
        formSchema: [
          { key: "application", label: "Application", type: "text", required: true, helpText: null },
          { key: "role", label: "Role or access level needed", type: "text", required: true, helpText: "For example: read-only, editor, approver" },
          neededBy,
        ],
      },
    ],
  },
  {
    key: "cloud_resource",
    name: "Cloud resources",
    description: "Cloud accounts, environments and services.",
    icon: "cloud",
    items: [
      {
        name: "Cloud resource",
        description: "A new cloud environment, service or account.",
        approvalMode: "approvers",
        riskLevel: "high",
        formSchema: [
          { key: "provider", label: "Provider", type: "select", required: true, options: ["AWS", "Microsoft Azure", "Google Cloud", "Other"], helpText: null },
          { key: "resource", label: "What do you need?", type: "text", required: true, helpText: "For example: a staging database, a storage bucket" },
          { key: "environment", label: "Environment", type: "select", required: true, options: ["Development", "Staging", "Production"], helpText: null },
          { key: "monthly_cost", label: "Estimated monthly cost", type: "number", required: false, helpText: "In your organisation's currency" },
        ],
      },
    ],
  },
  {
    key: "access_card",
    name: "Access cards",
    description: "Building and room access.",
    icon: "id-card",
    items: [
      {
        name: "Access card",
        description: "A new, replacement or extended access card.",
        approvalMode: "approvers",
        riskLevel: "medium",
        formSchema: [
          { key: "card_request", label: "Request", type: "select", required: true, options: ["New card", "Replacement (lost or damaged)", "Access to another area"], helpText: null },
          { key: "area", label: "Building or area", type: "text", required: true, helpText: null },
        ],
      },
    ],
  },
  {
    key: "it_solution",
    name: "IT solutions",
    description: "Anything else you need from IT.",
    icon: "lightbulb",
    items: [
      {
        name: "Something else",
        description: "Describe what you need and IT will take it from there.",
        approvalMode: "none",
        riskLevel: "low",
        formSchema: [],
      },
    ],
  },
];
