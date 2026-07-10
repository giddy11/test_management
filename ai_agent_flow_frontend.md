# Frontend Engineering Standards & AI Agent Scaffold Guide

> **Purpose:** This document is the authoritative scaffold guide for all frontend implementations. It defines the patterns, rules, and workflow that every frontend feature must follow — whether consumed by a web client or a mobile client (React Native / Expo). AI agents must read and follow this guide before generating any frontend code.

---

## 1. Core Philosophy

| Principle | Description |
|---|---|
| **Separation of Concerns** | UI → Hooks/State → Endpoints → Transport. Each layer owns one job. |
| **Components Never Call APIs** | All API access goes through the endpoint layer only. |
| **Reusability First** | Shared logic lives in hooks and utilities — never duplicated in components. |
| **Performance Aware** | Paginate datasets, virtualise long lists, memoize expensive derivations. |
| **Offline Resilient** | Cache critical reads locally. Degrade gracefully when offline. |
| **Consistent Response Handling** | The transport layer parses `ApiResponse` uniformly so every endpoint gets clean data. |

---

## 2. Layered Architecture

```
[ UI — Pages / Screens ]
        ↓
[ Feature Hooks ]          ← Data fetching, state, derived values
        ↓
[ Endpoint Layer ]         ← Named, typed API call functions
        ↓
[ Transport Layer ]        ← HTTP client, auth headers, retries, error normalisation
        ↓
[ Backend API ]
```

**Caching sits between Hooks and the Endpoint layer.** The hook checks local cache first; if stale or missing, it calls the endpoint.

---

## 3. Folder Structure

```
src/
 ├── pages/                   Web pages (React Router / Next.js)
 │    └── patients/
 │         ├── PatientsPage.tsx
 │         └── PatientDetailPage.tsx
 │
 ├── screens/                 Mobile screens (React Native)
 │    └── patients/
 │         ├── PatientsScreen.tsx
 │         └── PatientDetailScreen.tsx
 │
 ├── components/
 │    ├── shared/             Reusable across all features
 │    │    ├── Button/
 │    │    ├── Input/
 │    │    ├── Modal/
 │    │    └── EmptyState/
 │    └── patients/           Feature-specific components
 │         ├── PatientCard.tsx
 │         ├── PatientTable.tsx
 │         └── PatientFilters.tsx
 │
 ├── hooks/
 │    ├── usePatients.ts
 │    ├── useInfinitePatients.ts  ← mobile / infinite scroll variant
 │    └── useAuth.ts
 │
 ├── endpoints/               One file per backend module
 │    ├── patient.endpoints.ts
 │    ├── auth.endpoints.ts
 │    └── billing.endpoints.ts
 │
 ├── transport/
 │    └── http.ts             Axios / Fetch wrapper — single instance
 │
 ├── contexts/
 │    ├── AuthContext.tsx
 │    └── ThemeContext.tsx
 │
 ├── cache/
 │    └── localCache.ts       Dexie / AsyncStorage / React Query cache
 │
 ├── utils/
 │    ├── formatDate.ts
 │    ├── formatCurrency.ts
 │    └── debounce.ts
 │
 ├── types/
 │    ├── patient.types.ts
 │    └── api.types.ts        Mirrors ApiResponse envelope from backend
 │
 ├── assets/
 └── styles/
      ├── theme.ts
      └── globals.css
```

---

## 4. Shared Type Definitions (Mirrors Backend Envelope)

```typescript
// types/api.types.ts
export interface ApiResponse<T = null> {
  success: boolean;
  message: string;
  statusCode: number;
  data: T | null;
  errors: ValidationError[];
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor?: string;
}

export interface ValidationError {
  field: string;
  message: string;
}
```

---

## 5. Transport Layer

The transport layer is a **single instance**. All HTTP configuration lives here — never scattered across components or endpoint files.

```typescript
// transport/http.ts
import axios, { AxiosInstance, AxiosResponse, AxiosError } from "axios";
import { ApiResponse } from "../types/api.types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_API_URL;

const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

// Attach auth token on every request
http.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Normalise all responses into ApiResponse shape
http.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => response,
  async (error: AxiosError<ApiResponse>) => {
    if (error.response?.status === 401) {
      await handleTokenRefresh();
    }
    return Promise.reject(error);
  }
);

export async function wrapCall<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  payload?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  const config =
    method === "GET"
      ? { params: payload }
      : { data: payload };

  const response = await http.request<ApiResponse<T>>({
    method,
    url: path,
    ...config,
  });

  return response.data;
}

function getStoredToken(): string | null {
  // Web: localStorage / sessionStorage
  // Mobile: SecureStore / AsyncStorage
  return typeof window !== "undefined"
    ? localStorage.getItem("token")
    : null; // mobile implementation injects via separate module
}
```

---

## 6. Endpoint Layer

Every named API operation gets its own typed function. Components and hooks **only** call functions from this layer — never `wrapCall` directly.

```typescript
// endpoints/patient.endpoints.ts
import { wrapCall } from "../transport/http";
import { ApiResponse, PaginationMeta } from "../types/api.types";
import { Patient, CreatePatientPayload, FetchPatientsParams } from "../types/patient.types";

export interface PaginatedPatients {
  data: Patient[];
  meta: PaginationMeta;
}

export const PatientEndpoints = {
  fetchAll: (params: FetchPatientsParams) =>
    wrapCall<PaginatedPatients>("GET", "/api/v1/patients", params as Record<string, unknown>),

  fetchById: (id: string) =>
    wrapCall<Patient>("GET", `/api/v1/patients/${id}`),

  create: (payload: CreatePatientPayload) =>
    wrapCall<Patient>("POST", "/api/v1/patients", payload as Record<string, unknown>),

  update: (id: string, payload: Partial<CreatePatientPayload>) =>
    wrapCall<Patient>("PATCH", `/api/v1/patients/${id}`, payload as Record<string, unknown>),

  remove: (id: string) =>
    wrapCall<null>("DELETE", `/api/v1/patients/${id}`),
};
```

### Endpoint Layer Rules

| Rule | Requirement |
|---|---|
| Named functions, not bare HTTP calls | `PatientEndpoints.fetchAll()` not `axios.get(...)` |
| One file per backend module | `patient.endpoints.ts`, `billing.endpoints.ts` |
| Always typed | Return type always `Promise<ApiResponse<T>>` |
| No state management | Endpoints are pure async functions — no `useState`, no `useEffect` |
| No error handling | The transport layer normalises errors; hooks handle them |

---

## 7. Feature Hooks (Data + State)

Hooks are the bridge between the endpoint layer and the UI. They own:
- Fetching
- Loading / error state
- Pagination state
- Local caching
- Data transformation

```typescript
// hooks/usePatients.ts
import { useState, useEffect, useCallback } from "react";
import { PatientEndpoints, PaginatedPatients } from "../endpoints/patient.endpoints";
import { Patient } from "../types/patient.types";

interface UsePatientsOptions {
  ownerId: string;
  limit?: number;
  search?: string;
}

export function usePatients({ ownerId, limit = 20, search }: UsePatientsOptions) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [meta, setMeta] = useState<PaginatedPatients["meta"] | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);

    const result = await PatientEndpoints.fetchAll({
      page: targetPage,
      limit,
      search,
    });

    if (result.success && result.data) {
      setPatients(result.data.data);
      setMeta(result.data.meta);
    } else {
      setError(result.message);
    }

    setLoading(false);
  }, [limit, search]);

  useEffect(() => {
    fetch(page);
  }, [page, fetch]);

  return {
    patients,
    meta,
    page,
    loading,
    error,
    goToPage: setPage,
    refresh: () => fetch(page),
  };
}
```

### Infinite Scroll / Mobile Hook

```typescript
// hooks/useInfinitePatients.ts
import { useState, useCallback } from "react";
import { PatientEndpoints } from "../endpoints/patient.endpoints";
import { Patient } from "../types/patient.types";

export function useInfinitePatients(limit = 20) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    const result = await PatientEndpoints.fetchAll({ limit, cursor });

    if (result.success && result.data) {
      setPatients((prev) => [...prev, ...result.data!.data]);
      setCursor(result.data.meta.nextCursor ?? undefined);
      setHasMore(!!result.data.meta.nextCursor);
    }

    setLoading(false);
  }, [loading, hasMore, cursor, limit]);

  return { patients, loadMore, hasMore, loading };
}
```

### Hook Rules

| Rule | Requirement |
|---|---|
| One hook per feature domain | `usePatients`, `useBilling`, `useAppointments` |
| Hooks never touch the DOM | Pure state + logic — no JSX |
| Never call transport directly | Always via endpoint functions |
| Loading and error are always exposed | Never hide async state from the caller |
| Pagination state lives in the hook | Not in the page/screen component |

---

## 8. Component Standards

```typescript
// components/patients/PatientCard.tsx
import React from "react";
import { Patient } from "../../types/patient.types";

interface PatientCardProps {
  patient: Patient;
  onPress?: (id: string) => void;
}

export const PatientCard = React.memo(({ patient, onPress }: PatientCardProps) => {
  return (
    <div
      className="patient-card"
      onClick={() => onPress?.(patient.id)}
      role="button"
      tabIndex={0}
    >
      <span>{patient.firstName} {patient.lastName}</span>
      <span>{patient.phone}</span>
    </div>
  );
});

PatientCard.displayName = "PatientCard";
```

### Component Rules

| Rule | Requirement |
|---|---|
| No API calls inside components | Hooks only |
| `React.memo` on list items | Prevents unnecessary re-renders |
| Props are typed interfaces | Never `any` |
| Small and focused | One visual responsibility per component |
| No business logic | Components display — hooks decide |

---

## 9. Page / Screen Integration

```typescript
// pages/patients/PatientsPage.tsx
import React from "react";
import { usePatients } from "../../hooks/usePatients";
import { PatientCard } from "../../components/patients/PatientCard";
import { Pagination } from "../../components/shared/Pagination";
import { EmptyState } from "../../components/shared/EmptyState";
import { useNavigate } from "react-router-dom";

export default function PatientsPage() {
  const navigate = useNavigate();
  const { patients, meta, page, loading, error, goToPage } = usePatients({
    ownerId: "current-owner-id",
    limit: 20,
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!patients.length) return <EmptyState message="No patients found" />;

  return (
    <div>
      {patients.map((p) => (
        <PatientCard
          key={p.id}
          patient={p}
          onPress={(id) => navigate(`/patients/${id}`)}
        />
      ))}

      {meta && (
        <Pagination
          page={page}
          totalPages={meta.totalPages}
          onPageChange={goToPage}
        />
      )}
    </div>
  );
}
```

---

## 10. Frontend Validation (Client-Side)

Client-side validation improves UX — it does not replace backend validation.

```typescript
// Use Zod in both frontend and backend for consistent schemas
import { z } from "zod";

export const createPatientFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().regex(/^\+?[0-9]{7,15}$/, "Invalid phone number"),
  gender: z.enum(["male", "female", "other"]),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
});

export type CreatePatientForm = z.infer<typeof createPatientFormSchema>;
```

```typescript
// In a form hook or submit handler
const result = createPatientFormSchema.safeParse(formData);

if (!result.success) {
  setErrors(result.error.flatten().fieldErrors);
  return;
}

const response = await PatientEndpoints.create(result.data);
```

---

## 11. State Management Rules

| State Type | Where It Lives |
|---|---|
| Server data (list, detail) | Feature hook (`usePatients`) |
| UI state (modal open, active tab) | Local `useState` in the component |
| Global auth state | `AuthContext` |
| Theme / preferences | `ThemeContext` |
| Form state | Local hook or `react-hook-form` |
| Navigation state | Router (React Router / Expo Router) |

**Rules:**
- Do not lift server data into global context unless it is genuinely shared across many unrelated pages
- Do not store derived data — compute it from source data via `useMemo`
- Do not duplicate data between global state and local state

```typescript
// Derived state — compute, don't store
const activePatients = useMemo(
  () => patients.filter((p) => p.status === "active"),
  [patients]
);
```

---

## 12. Performance Standards

| Technique | When to Apply |
|---|---|
| `React.memo` | All list item components |
| `useMemo` | Expensive derived computations |
| `useCallback` | Functions passed as props or used in `useEffect` deps |
| Lazy load / code splitting | Feature pages — only loaded when navigated to |
| Virtualised lists | Any list with 50+ items (`react-window` / `FlashList`) |
| Debounced search | Search inputs — 300ms delay before API call |
| Infinite scroll pagination | Mobile screens |
| Offset pagination | Web admin tables |

```typescript
// Debounced search example
const [searchTerm, setSearchTerm] = useState("");
const debouncedSearch = useDebounce(searchTerm, 300);

const { patients } = usePatients({ ownerId, search: debouncedSearch });
```

---

## 13. Caching Standards

```typescript
// cache/localCache.ts — lightweight wrapper over AsyncStorage / localStorage
export const LocalCache = {
  async get<T>(key: string): Promise<T | null> {
    const raw = await storage.getItem(key);
    if (!raw) return null;
    const { value, expiresAt } = JSON.parse(raw);
    if (Date.now() > expiresAt) {
      await storage.removeItem(key);
      return null;
    }
    return value as T;
  },

  async set<T>(key: string, value: T, ttlMs = 5 * 60 * 1000): Promise<void> {
    await storage.setItem(key, JSON.stringify({ value, expiresAt: Date.now() + ttlMs }));
  },

  async invalidate(key: string): Promise<void> {
    await storage.removeItem(key);
  },
};
```

- Cache list results for 5 minutes (TTL)
- Invalidate on create, update, delete
- Mobile: prefer `AsyncStorage` or `expo-secure-store` for sensitive data
- Web: prefer `sessionStorage` for session-scoped data, `localStorage` for persistent preferences

---

## 14. Mobile vs Web Differences

| Concern | Web | Mobile |
|---|---|---|
| Storage | `localStorage` / `sessionStorage` | `AsyncStorage` / `expo-secure-store` |
| Navigation | React Router | Expo Router / React Navigation |
| Lists | CSS scroll + `react-window` | `FlatList` + `FlashList` |
| Pagination | Offset (page buttons) | Cursor-based (infinite scroll) |
| Token storage | `localStorage` (access), `httpOnly cookie` (refresh) | `SecureStore` |
| API base URL | `NEXT_PUBLIC_API_URL` | `EXPO_PUBLIC_API_URL` |
| Network state | `navigator.onLine` | `@react-native-community/netinfo` |

**The endpoint and transport layers are shared** between web and mobile. Only storage and navigation adapters differ.

---

## 15. Naming Conventions

| Type | Convention | Example |
|---|---|---|
| Component files | PascalCase | `PatientCard.tsx` |
| Hook files | camelCase | `usePatients.ts` |
| Endpoint files | camelCase + `.endpoints` | `patient.endpoints.ts` |
| Type files | camelCase + `.types` | `patient.types.ts` |
| Context files | PascalCase + `Context` | `AuthContext.tsx` |
| Utility files | camelCase | `formatDate.ts` |

---

## 16. Feature Scaffold Checklist

When adding a new frontend feature (e.g. `appointment`):

```
[ ] 1. Define types                    types/appointment.types.ts
[ ] 2. Create endpoint functions       endpoints/appointment.endpoints.ts
[ ] 3. Build feature hook(s)           hooks/useAppointments.ts
[ ] 4. Build reusable components       components/appointments/
[ ] 5. Build page / screen             pages/appointments/ or screens/appointments/
[ ] 6. Add route                       App.tsx / router config
[ ] 7. Write component render tests
[ ] 8. Write endpoint mock tests
[ ] 9. Add data-cy attributes          every interactive element the feature adds
[ ] 10. Write Cypress E2E spec         cypress/e2e/appointments/appointments.cy.ts — see §20
```

---

## 17. File Size Limits

| Layer | Max Lines |
|---|---|
| Page / Screen | 200 |
| Component | 300 |
| Hook | 150 |
| Endpoint file | 100 |
| Utility | 150 |
| Context | 200 |

If a file exceeds its limit, split by sub-feature:
```
usePatients.ts
usePatientForm.ts
usePatientFilters.ts
```

---

## 18. AI Agent Mandatory Rules

AI agents building frontend features MUST:

- Never call `axios`, `fetch`, or `wrapCall` inside a component
- Always go through `[domain].endpoints.ts` for API calls
- Always use `useX` hooks to bridge endpoints and UI
- Always type props with an interface — never use `any`
- Always expose `loading` and `error` from hooks
- Always paginate and handle `meta` from the backend
- Use `React.memo` on list item components
- Use `useMemo` for derived/filtered lists
- Add `data-cy` attributes to every interactive element they create (buttons, inputs, links, menu items)
- Write or extend a Cypress E2E spec for every user-facing feature — see §20

AI agents MUST NOT:

- Place API logic inside page/screen components
- Duplicate endpoint functions across files
- Store server data in `Context` unless it is genuinely global (auth, user profile)
- Skip client-side validation on forms
- Create a new utility if one already exists in `utils/`
- Use native browser dialogs — see §19
- Ship a feature without E2E coverage, or write E2E tests that hit a real API/database — see §20

---

## 19. No Native Browser Dialogs

> `window.alert()`, `window.confirm()`, and `window.prompt()` are **banned** in this codebase. They block the main thread, ignore the application's visual design, and cannot be styled or tested.

### 19.1 Required Replacements

| Native call | Replace with |
|---|---|
| `window.alert(message)` | `notify(message, "error")` from `ToastContext` |
| `window.confirm("Are you sure?")` | `<Modal>` with a confirm button and a cancel button |
| `window.prompt("Enter value:", default)` | `<Modal>` containing an `<Input>` and a submit button |

### 19.2 Confirm Pattern

Use the shared `<Modal>` with two actions when you need a destructive confirmation:

```tsx
const [confirmOpen, setConfirmOpen] = useState(false);

<Button variant="danger" onClick={() => setConfirmOpen(true)}>Delete</Button>

<Modal open={confirmOpen} title="Delete item" onClose={() => setConfirmOpen(false)}>
  <div className="modal-body">
    <p>This action cannot be undone. Are you sure?</p>
  </div>
  <div className="modal-foot">
    <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
    <Button variant="danger" onClick={handleDelete}>Delete</Button>
  </div>
</Modal>
```

### 19.3 Prompt Pattern

Use the shared `<Modal>` with an `<Input>` and a submit handler when you need user text or number input:

```tsx
const [open, setOpen] = useState(false);
const [value, setValue] = useState("");

<Button onClick={() => setOpen(true)}>Enter value</Button>

<Modal open={open} title="Enter new value" onClose={() => setOpen(false)}>
  <div className="modal-body">
    <Input
      label="Value"
      type="number"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
      autoFocus
    />
  </div>
  <div className="modal-foot">
    <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    <Button onClick={handleSubmit}>Confirm</Button>
  </div>
</Modal>
```

### 19.4 Rules

- **Never** call `window.alert()`, `window.confirm()`, or `window.prompt()` anywhere in the client codebase
- **Never** use `alert()`, `confirm()`, or `prompt()` without the `window.` prefix either — they refer to the same globals
- All modals must use the shared `<Modal>` component from `components/shared/Modal`
- All inline feedback (success, error, info) must use `notify()` from `ToastContext`
- Submit on Enter (`onKeyDown` handler) is required on single-input prompt modals

---

## 20. End-to-End Testing (Cypress)

Every user-facing feature ships with a Cypress E2E spec. The suite lives in the
client alongside the app (`cypress/`, `cypress.config.ts`) and its full
reference documentation is `client/cypress/README.md` — read it before writing
tests.

### 20.1 The Golden Rule — Stub First, Never Touch Real Data

E2E tests are **fully network-stubbed** with `cy.intercept()`. They never call
a real API and never read or write a real database. This is non-negotiable in
projects where environments share a database (dev and prod share one here).

To enforce it, tests run against the app started in a dedicated mode
(`npm run dev:e2e` → `.env.e2e`) whose API URL points at a **dead local port**.
A request a test forgot to stub fails instantly — it can never leak data.

Stub responses must mirror the backend's `ApiResponse` envelope exactly
(§4). Use the helpers in `cypress/support/api.ts`: `ok(data, meta?)`,
`fail(message, statusCode)`, `listMeta(total)`.

### 20.2 Folder & Naming Conventions

```
cypress/
  e2e/<feature>/<journey>.cy.ts     one folder per feature area, kebab-case specs
  fixtures/<domain>/<name>.json     stub payloads, grouped per domain
  support/api.ts                    envelope builders + URL matchers
  support/commands.ts               custom commands (typed)
  support/e2e.ts                    global setup
```

### 20.3 Custom Commands — Use Them, Don't Reinvent Them

| Command | Purpose |
|---|---|
| `cy.dataCy("id")` | The **only** sanctioned selector style |
| `cy.login(role?, overrides?)` | Stubbed session for `"user"` / `"admin"` / `"superadmin"` — seeds tokens, stubs `/auth/me` + layout calls |
| `cy.stubDashboard()` | Dashboard data stubs (`@overview`, `@recentRuns`, `@projects`) |
| `cy.interceptApi(method, path, { body }, alias)` | Precise intercept for one `/api/v1` path |
| `cy.logout()` / `cy.waitForLoader()` | Shared UI flows |
| `cy.loginByApi(email, password)` | Real login via `cy.session()` — **live smoke specs only**, read-only |

### 20.4 Selector Rules

- Every interactive element gets a `data-cy` attribute at build time —
  `data-cy="create-appointment-submit"` — added as an attribute only, never
  changing behavior.
- **Never** select by CSS hierarchy, nth-child, generated class names, or
  visible text as a locator (asserting on text is fine; locating by it is not).

### 20.5 Spec Skeleton

```typescript
// cypress/e2e/appointments/appointments.cy.ts
import { ok, listMeta } from "../../support/api"

describe("Appointments", () => {
  beforeEach(() => {
    cy.login("admin")
    cy.fixture("appointments/list").then((rows) => {
      cy.interceptApi("GET", "/appointments", { body: ok(rows, listMeta(rows.length)) }, "appointments")
    })
    cy.visit("/appointments")
    cy.wait("@appointments")           // wait on aliases — never cy.wait(5000)
  })

  it("creates an appointment", () => {
    cy.interceptApi("POST", "/appointments", { body: ok({ id: "e2e-appt-1" }) }, "create")
    cy.dataCy("new-appointment").click()
    cy.dataCy("appointment-title").type("Follow-up")
    cy.dataCy("appointment-submit").click()
    cy.wait("@create").its("request.body.title").should("eq", "Follow-up")
    cy.contains("Appointment created").should("be.visible")
  })
})
```

### 20.6 E2E Rules

- Stub **before** `cy.visit()`; wait on aliases, never on time.
- Cover at minimum: the happy path, one validation failure, and one API error
  (`fail(...)` + non-2xx `statusCode`) per journey.
- Tests are independent — each one logs in and stubs everything it needs;
  never depend on state left by a previous test.
- Role-gated features get an access-control test (allowed role sees it,
  blocked role is redirected).
- Run `npm run e2e` before handing work over; all specs must pass.
- Live-mode specs (real API) are opt-in via env credentials, read-only, and
  live under `cypress/e2e/live/` — never add write operations there.

---

## 21. Final Principle

> **"Pages display. Hooks decide. Endpoints fetch. Transport handles the wire. Modals replace dialogs. Cypress proves it all works."**

This sequence is non-negotiable on every feature, for every client platform, on every project scaffolded from this guide.
