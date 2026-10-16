# AI integration — Phase 0 report and plan

Source brief: [`ai-integration-prompt.md`](../ai-integration-prompt.md). This is the Phase 0 output it asks for:
what the codebase looks like, the design decisions (with defaults), and the structure to build.
**No code has been written yet. Phase 1 starts once this plan is approved.**

Target app: **TestMate** — multi-tenant test-case management (projects → suites → cases → runs),
plus bugs, feature requests, external feedback tickets with a client-company IT support tier, SLA reporting and live chat.

---

## 1. Discovery: how this repo works (the conventions the AI layer must follow)

| Area | What TestMate does | Consequence for the AI layer |
|---|---|---|
| Language / runtime | Node ≥20, Express 4, run with `tsx`. JS → TS incremental migration (`allowJs`, `checkJs:false`, `strict` for `.ts`). **All new files are `.ts`.** Existing `.js` keeps `require`/`module.exports`; new `.ts` files mix `import` (TS) with `require` (JS deps). | Every AI file is `.ts`. `tsc --noEmit` (`npm run typecheck`) must pass. |
| Modules | `server/modules/<name>/{controllers,dto,entities,repositories,routes,services,tests,validators}` (+ `catalog`, `domain` where needed). Services/repos are classes with `static Instance = new X()` and constructor-injected deps (defaults to the other `Instance`s). | New `modules/ai/` with the same folders plus `domain/`. Services take a `providerFor` resolver + repos in the constructor so tests inject fakes. |
| ORM / DB | PostgreSQL + TypeORM 0.3, **`EntitySchema`** (not decorators), every entity registered by hand in `infrastructure/database/dataSource.js`. Hand-written `.ts` migrations, timestamp-named (latest `1783490000000`), raw SQL via `q.query`, `IF NOT EXISTS` style. | `ai_credentials`, `ai_usage_logs` (+ credits tables in Phase 2) as `EntitySchema`s, one migration per phase starting at `1783500000000`. |
| Tenancy | No organisation table. `organization_id` (uuid) lives on users/projects; `Actor = { id, role, organizationId, clientCompanyId, isSupportLead, permissions }`. | "tenant" = `organizationId`. Secret-box context = `${organizationId}:${userId ?? "org"}:${provider}`. |
| Auth / permissions | `authMiddleware` → permissions resolved from DB (`permissions.middleware.js`, cached). **Every route must declare a guard** (`requirePermission`, `requireAny`, `requireProjectAccess`, `requireAuthenticatedOnly`, `publicRoute`) or the boot-time audit blocks it. Services re-check with `can` / `assertPermission`. Inside a project, rights come from the project role: `ProjectService.assertCanContribute(actor, projectId)` (lead/member) vs viewer. | AI routes use `requirePermission("ai.use")`-style guards at the route **and** the existing project checks in the service ("reuse the permission that guards editing X"). |
| Permission catalog | `modules/access/catalog/permissions.catalog.js` (categories, permissions, built-in roles). **The seed never grants a new permission to an existing role**, so a migration must grant it explicitly (precedent: `migrateProjectLevelPermissions` in `accessSeed.service.js`). Vendor-only codes go in `PLATFORM_ONLY`; support-desk codes in `SUPPORT_DESK_ONLY`. | New `ai` category + a migration that inserts the codes and grants them to the existing built-in roles. |
| Validation | Zod v3 on the server: `validate(schema)` parses `{ body, query, params }`, puts the result on `req.validated`, 422 with `[{field,message}]`. Client uses Zod v4. | `modules/ai/validators/ai.schema.ts` in the same shape. |
| Errors / responses | `AppError(message, statusCode, errors, data)`; `globalErrorHandler` forwards `data`. Envelope `ApiResponse.ok/created/error` → `{ success, message, statusCode, data, errors, meta }`. Controllers are static methods with `try/next(err)`. | `AiRequestError extends AppError`, puts `{ reason }` in `data` so the UI can branch on `no_key` / `no_credits` without parsing text. |
| Env | `config/env.js`, hand-rolled (no Zod), "nothing else reads `process.env`". `env.isProduction` exists. | Add `env.ai = { keysSecret, configured, requestTimeoutMs, longRequestTimeoutMs }` + a ≥32-char check that throws at boot if set too short; warn in production when unset. |
| Rate limiting | `express-rate-limit` v7, `buildLimiter({windowMs,max,message})`, keyed by IP; a global 300/15 min on `/api/v1`. | Add `aiRateLimiter` (30/15 min) with `keyGenerator: req.user?.id ?? ip`; runs **after** `authMiddleware`. |
| Audit | `ActivityService.log(actor, opts)` (fire-and-forget) or `buildEntry()` inserted in the same transaction for critical changes. | Key save/activate/remove/pin and credit grants use `buildEntry()` inside the transaction. |
| Logging | `console.*` with `[module]` prefixes. No logger library. | `console.warn("[ai] …")`; never the key, never prompt/reply text (dev-only 300-char reply excerpt). |
| Background jobs | None (no queue / cron). | Background auto-run (§11 of the brief) is out of scope unless asked. |
| Tests | Jest 29 + ts-jest, `modules/**/tests/**/*.spec.ts`, `shared/**/tests/**/*.spec.ts`; DataSource mocked in `test/dataSource.mock.js`. Cypress for the client with stubbed network. | Specs in `modules/ai/tests/`, `shared/utils/tests/`, `infrastructure/ai/tests/` (add that glob to the Jest config). |
| Client | React 19 + Vite + TS, TanStack Query v5 (plain `useQuery`/`useMutation` per hook file, `ApiError` thrown when `!res.success`), axios `wrapCall(method, path, payload)` with a **fixed 20 s timeout**, shadcn-style `components/ui` (Radix), `sonner` toasts, `react-hook-form`, lucide icons. Layers: `types/` → `endpoints/` → `hooks/` → `components/` → `pages/`. Settings is one `pages/SettingsPage.tsx` with `Tabs`. Client-side permission check in `lib/can.ts`. | `wrapCall` gets an optional `{ timeoutMs }` argument (AI calls need 30 s–21 min). New `types/ai.types.ts`, `endpoints/ai.endpoints.ts`, `hooks/useAi.ts`, `components/ai/*`, and an **AI** tab in Settings. |

Existing `ai_agent_flow_*.md` files are coding-standard guides for agents, not an AI feature; no AI code exists yet.

---

## 2. Design decisions (defaults applied — tell me to change any)

| # | Question | Decision (default) |
|---|---|---|
| D1 | Who owns AI keys? | **User's own key wins, else the organisation's key.** The brief's "platform key" maps to an **organisation key** set by an org admin (`ai.managekeys`). TestMate's super admin is the vendor; a vendor-wide fallback key across all orgs is **not** built unless you want it. |
| D2 | Credits? | **Yes, behind a flag (Phase 2)**, spent only on the organisation's key, prices default to 0 = free. Granted by the org admin. |
| D3 | A payer other than the clicker? | **No.** The org key already covers members. (Project team-lead-pays delegation can be added later.) |
| D4 | First features | **`bug_report_draft`** and **`feature_request_draft`** (see §8). `test_case_draft` was planned and then dropped; optional later: **`test_suite_plan`** (plan then create). |
| D5 | Background auto-run? | **No.** |
| D6 | Providers | **Anthropic, OpenAI, Gemini, Ollama** behind one `AiProvider` interface. |
| D7 | Chat feature | **Not in v1.** |

---

## 3. Structure to create

### 3.1 Server

```
server/
├─ config/env.js                                   + env.ai block (edit)
├─ shared/
│  ├─ utils/secretBox.ts                           AES-256-GCM seal/open, AAD-bound context
│  ├─ utils/tests/secretBox.spec.ts
│  └─ middleware/rateLimiter.middleware.js         + aiRateLimiter (per-user key) (edit)
├─ infrastructure/ai/
│  ├─ aiProvider.ts           contract: AI_PROVIDERS, AiProvider, AiGenerateRequest/Result, AiChatRequest,
│  │                          AiModelInfo, AiErrorKind, AiProviderError, isAccountProblem
│  ├─ anthropicProvider.ts    generate (output_config json_schema) / stream / listModels
│  ├─ openaiProvider.ts       response_format json_schema strict / stream include_usage / filtered listModels
│  ├─ geminiProvider.ts       responseJsonSchema / generateContentStream / filtered listModels
│  ├─ ollamaProvider.ts       format + schema-in-prompt, num_ctx estimate, fetch timeout wrapper
│  ├─ serverAddress.ts        OLLAMA_CLOUD, checkServerAddress (SSRF guard)
│  ├─ modelTiers.ts           name → capable | balanced | fast | null (advice only)
│  ├─ providers.ts            registry + providerFor resolver
│  └─ tests/                  normalise per vendor, image placement, contextFor, serverAddress, modelTiers
├─ modules/ai/
│  ├─ domain/
│  │  ├─ features.ts          AI_FEATURES const tuple (single source of truth) + AiFeature type
│  │  ├─ aiErrors.ts          AiRequestError, AiFailureReason, NEEDS_PAYER_ACTION, toRequestError, UnusableReply
│  │  ├─ lenient.ts           looseText, looseList, looseChoice, strictChoice, describeRejection, fit, inert
│  │  ├─ parseJson.ts         strips <think>, JSON.parse, first-{ to last-} fallback
│  │  ├─ testCaseDraft.ts     Zod (lenient) + JSON schema + SYSTEM_PROMPT + buildPrompt + post-process
│  │  └─ bugReportDraft.ts    same four parts
│  ├─ entities/
│  │  ├─ aiCredential.entity.ts
│  │  └─ aiUsageLog.entity.ts
│  ├─ repositories/
│  │  ├─ aiCredential.repository.ts
│  │  └─ aiUsage.repository.ts
│  ├─ services/
│  │  ├─ ai.service.ts                 generateJson / streamText / status — the only thing features call
│  │  ├─ aiCredential.service.ts       save (verify first) / list / activate / remove / models /
│  │  │                                setFeatureModel / resolveFor / statusFor
│  │  ├─ testCaseDraft.service.ts      loads suite/case via access-checked services → AiService
│  │  └─ bugReportDraft.service.ts     loads case/run result via access-checked services → AiService
│  ├─ dto/ai.dto.ts                    AiCredentialDTO (no ciphertext), AiStatusDTO, TestCaseDraftDTO, BugReportDraftDTO
│  ├─ validators/ai.schema.ts          request schemas (length-limited)
│  ├─ controllers/
│  │  ├─ aiCredential.controller.ts    shared by org + own scopes
│  │  └─ ai.controller.ts              status + draft endpoints (thin)
│  ├─ routes/ai.routes.ts              keyRoutes(base, permission, controller) helper + feature routes
│  └─ tests/                           ai.service, aiCredential.service, lenient, parseJson, per-feature specs
├─ modules/access/catalog/permissions.catalog.js   + "ai" category and codes (edit)
├─ infrastructure/database/dataSource.js           + AiCredential, AiUsageLog (edit)
├─ infrastructure/database/migrations/
│  ├─ 1783500000000-AddAiCredentialsAndUsage.ts
│  └─ 1783510000000-AddAiPermissions.ts            inserts codes, grants to existing built-in roles
└─ app.js                                          api.use("/ai", aiRoutes) (edit)
```

Phase 2 (credits) adds `entities/aiCreditAccount.entity.ts`, `aiCreditTransaction.entity.ts`,
`aiSettings.entity.ts` (per-org `credit_prices`), `repositories/aiCredit.repository.ts` (the atomic
`UPDATE … WHERE balance + $2 >= 0 RETURNING` + ledger row in one transaction), `services/aiCredit.service.ts`
(the real `AiCreditCharger`, now `AiService`'s default), `domain/credits.ts`, and migration
`1783520000000-AddAiCredits.ts` (tables + `ai.managecredits` grant).

Credit routes (under `/api/v1/ai`):

| Method | Path | Guard |
|---|---|---|
| GET | `/me/credits?page&limit` — balance, prices, visible history | `ai.use` |
| POST | `/me/credits/clear-history` `{ dryRun? }` — hides, never deletes | `ai.use` |
| GET | `/org/credits/accounts?search&page&limit` | `ai.managecredits` |
| POST | `/org/credits/grants` `{ userId, amount, note? }` — negative corrects, never below 0 | `ai.managecredits` |
| GET / PUT | `/org/credits/prices` `{ prices: { feature: n } }` — 0 / absent = free | `ai.managecredits` |

"Credits off" is simply an organisation with no prices set: `/ai/status` then reports `credits: null`.

### 3.2 Client

```
client/src/
├─ transport/http.ts                 wrapCall(..., { timeoutMs }) option (edit)
├─ types/ai.types.ts                 DTO mirrors, AI_PROVIDERS {id,label}, AI_FEATURES {id,label,description}, credits(n)
├─ endpoints/ai.endpoints.ts         timeouts: key check/save 30 s, drafts 120 s, suite plan 1 260 000 ms
├─ hooks/useAi.ts                    useAiStatus, useAiKeys(scope), useAiKeyModels(scope, provider),
│                                    useTestCaseDraft, useBugReportDraft (+ credits hooks in Phase 2)
├─ components/ai/
│  ├─ AiDraftButton.tsx              the one button every feature uses (invitation / price / disclosure)
│  ├─ AiDraftNotice.tsx              "AI draft: read it before you save", model used, caveats
│  ├─ AiKeysCard.tsx                 provider, key, check & load models, model picker, Ollama address, saved keys
│  ├─ AiFeatureModels.tsx            per-feature provider/model pin
│  └─ ModelGuide.tsx                 capable / balanced / fast explainer + pricing links
├─ pages/SettingsPage.tsx            + "AI" tab: own keys (ai.ownkey), organisation keys (ai.managekeys)
└─ lib/can.ts                        (reuse; no change expected)
```

Draft buttons are wired into the existing test-case editor and bug form in Phase 3.

---

## 4. Tables, routes, permissions, env

### Tables (Phase 1)

- **`ai_credentials`** — `id`, `organization_id`, `user_id` (NULL = organisation key), `provider` (CHECK in the 4 ids), `model`, `chat_model` (nullable), `feature_models` jsonb `{}`, `base_url` (nullable, Ollama), `key_ciphertext`, `key_last4` varchar(4), `is_active`, `updated_by_id`, `created_at`, `updated_at`, `deleted_at`.
  Unique partial indexes: `(organization_id, provider) WHERE user_id IS NULL AND deleted_at IS NULL` and `(user_id, provider) WHERE user_id IS NOT NULL AND deleted_at IS NULL`.
- **`ai_usage_logs`** (append-only, **no prompt/reply content**) — `organization_id`, `user_id`, `key_source` (user|organization), `provider`, `model`, `feature`, `input_tokens`, `output_tokens`, `status` (ok|error), `error_kind`, `duration_ms`, `project_id` (nullable context), `created_at`. Indexes `(organization_id, created_at)`, `(user_id, created_at)`.

### Routes (all under `/api/v1/ai`, all behind `authMiddleware`)

| Method | Path | Guard | Notes |
|---|---|---|---|
| GET | `/status?projectId&feature` | `ai.use` | what the button needs |
| GET | `/org/credentials` · `/me/credentials` | `ai.managekeys` · `ai.ownkey` | list (last4 only) |
| PUT | `…/credentials/:provider` | same | verify with provider, then encrypt and store; 503 if no secret |
| POST | `…/credentials/:provider/models` | same + `aiRateLimiter` | typed or saved key → models with tier |
| POST | `…/credentials/:provider/activate` | same | |
| DELETE | `…/credentials/:provider` | same | soft delete |
| PUT / DELETE | `…/feature-models/:feature` | same | pin / unpin |
| POST | `/test-case-draft` | `requirePermission("ai.use")` + `aiRateLimiter` at the route; `ProjectService.assertCanContribute` in the service | returns a draft; saves nothing |
| POST | `/bug-report-draft` | same | returns a draft; saves nothing |

(The route audit classifies a route by its **first** guard, so draft routes declare `ai.use` there and leave the per-project decision to the service, as the project-level routes already do.)

### Permissions (new `ai` category)

| Code | Granted by the migration to |
|---|---|
| `ai.use` — use AI drafting | Organisation administrator, Test lead, QA engineer, Tester |
| `ai.ownkey` — save my own keys | Organisation administrator, Test lead, QA engineer, Tester |
| `ai.managekeys` — manage the organisation's keys | Organisation administrator |
| `ai.managecredits` — grant credits / set prices | Organisation administrator — **added in Phase 2**, with the routes that enforce it (the role-matrix spec fails on a catalog permission no route enforces) |

Support lead gets none (support-desk users never see the product surface). The super admin has the wildcard.

### Env

| Var | Rule |
|---|---|
| `AI_KEYS_SECRET` | optional; ≥32 chars if set. Unset → keys can't be saved, AI off, `storageReady:false` shown in Settings, warning logged in production. |
| `AI_REQUEST_TIMEOUT_MS` | default `90000` |
| `AI_LONG_REQUEST_TIMEOUT_MS` | default `1200000` |

These also go into `env.example.yaml` and `render.yaml`.

### Dependencies (server)

`@anthropic-ai/sdk`, `openai`, `@google/genai`, `ollama`. Exact current versions and structured-output parameters will be checked against each vendor's current docs when the adapters are written, as the brief warns these change.

---

## 5. First features (TestMate's equivalents of the MentorPath drafts)

| Feature id | Fills | Input sent to the model | Not sent |
|---|---|---|---|
| `bug_report_draft` | Bug form: `title`, `description`, `stepsToReproduce`, `expectedBehavior`, `actualBehavior`, `environment`, suggested `severity` / `priority` (enums, or `"unknown"`), `caveats` | the tester's rough notes; when filed from a failed run: the case's steps + expected result and the run result's status/notes | reporter/assignee identity, screenshots (v1), project member list |
| *(optional)* `test_suite_plan` | A plan of N cases from a requirement or feature-request text; `POST /ai/test-suite-plan` (nothing saved) then `POST /ai/test-suite-plan/create` (no AI, creates what the human kept) | requirement text, existing case titles in the suite | as above |

Each follows the brief's recipe: lenient Zod + hand-written strict JSON Schema + system prompt with `<not_visible_to_you>` + `inert()` on user text + post-processors (`fit()` to column lengths, enum fallback, drop empty steps). Each returns `{ …draft, provider, model, creditsCharged }` and **never saves**; the existing create/update endpoints do that after the human reviews.

---

## 6. Phases

1. **Foundation** — env, `secretBox`, provider contract and four adapters, registry, model tiers, SSRF guard, `AiCredentialService` + routes, `AiService` (attempt / generateJson / streamText / status, refund hooks stubbed until Phase 2), usage log, permissions + migration, `aiRateLimiter`, error mapping, tests.
2. **Credits** — tables, atomic charge/refund, grant, history (hide-only), price map, admin list.
3. **Features** — `bug_report_draft` and `feature_request_draft` (built as the AI Bug & Feature Request Assistant, §8).
4. **Settings UI** — AI tab: `AiKeysCard` (own + org), `AiFeatureModels`, credits cards.
5. **Optional** — suite planner, chat, anything else you choose.

After each phase: `npm run typecheck` (server) and `tsc -b` (client). Per your standing preference, **you run Jest/Cypress and commit**; I'll list exactly which specs to run.

Can't be verified without real keys: the four live provider round-trips (save key → list models → draft → usage row). Everything else is covered by fake-provider tests.

---

## 7. Open questions (answer only to change a default)

1. **D1:** organisation key + own key only, or also a **vendor-wide fallback key** the super admin sets for every org?
2. **D2:** build credits now (Phase 2), or skip until there's a vendor key to meter?
3. **D4:** settled — bug reports and feature requests; test case drafts dropped.
4. Should **Testers** (not just QA engineers/leads) get `ai.use` by default?

---

## 8. Built: AI Bug & Feature Request Assistant

Covers the "AI-Powered Bug Reporting and Feature Request Assistant" user story.

| Piece | Where |
|---|---|
| Assistant panel (own words → whole form, follow-up questions with answers, Draft again, Regenerate, Restore my original) | `client/src/components/ai/AiAssistantPanel.tsx`, wired into `BugFormDialog` and `FeatureRequestFormDialog` |
| Field markers: "Filled by AI" / "AI suggestion — please confirm" | `client/src/components/ai/AiFieldMark.tsx` |
| Bug draft: title, description, steps, expected/actual, environment, suggested severity + priority (+ reason), evidence to attach, follow-up questions, fields to confirm | `server/modules/ai/domain/bugReportDraft.ts` · `POST /api/v1/ai/bug-report-draft` |
| Feature request draft: title, category, and Problem statement / Proposed solution / Business justification / Expected outcome / Acceptance criteria as headed plain-text sections in Description; inferred sections headed "(suggested — please confirm)" | `server/modules/ai/domain/featureRequestDraft.ts` · `POST /api/v1/ai/feature-request-draft` |
| Project context (access-checked): project description, suite/module, related test case, up to 3 similar bugs or requests. Never customer feedback tickets, names, comments or attachments | `server/modules/ai/services/draftContext.service.ts` |
| Usage report: requests, failure rate, response times (avg and slowest 5%), adoption, failures by cause | `GET /api/v1/ai/org/usage?days=7|30|90` (`ai.managekeys`) · Settings → AI → AI usage |

Rules the prompts enforce: organise, don't invent; leave unknown fields empty and ask instead; mark inferences for confirmation; severity/priority are suggestions only (and only when filing — they drive SLA targets); user text is treated as material, never instructions. Nothing is submitted, assigned or changed in status by the AI — the form's own button files the ticket, with the form's usual required fields.
