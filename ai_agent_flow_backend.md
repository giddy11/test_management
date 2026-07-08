# Backend Engineering Standards & AI Agent Scaffold Guide

> **Purpose:** This document is the authoritative scaffold guide for all backend implementations. Every new project, module, or feature must follow these standards. It is designed for AI coding agents, engineers, and architects to produce consistent, optimised, and production-ready backend systems.

---

## 1. Core Philosophy

| Principle | Description |
|---|---|
| **Separation of Concerns** | Validation → Controller → Service → Repository → Database. Each layer owns exactly one responsibility. |
| **SOLID** | Single responsibility per class/function. Open for extension, closed for modification. Depend on abstractions, not concretions. |
| **Performance First** | Every query that can return more than one row MUST be paginated and indexed. |
| **Security by Default** | Every inbound request is untrusted until validated, authenticated, and authorised. |
| **Idempotency** | Write operations must be retry-safe. |
| **Framework Independence** | Business logic in services must not depend on Express, Fastify, or any HTTP framework. |
| **API Agnosticism** | Endpoints must serve web clients and mobile clients equally — no platform-specific coupling. |

### 1.1 Language & Runtime — TypeScript is Mandatory

All backend code is written in **TypeScript**. Every code sample in this guide is TypeScript, and that is not cosmetic — it is the required language.

| Rule | Requirement |
|---|---|
| **New files are always `.ts`** | Never create a new `.js` file — controllers, services, repositories, entities, schemas, DTOs, routes, tests, scripts, migrations: all `.ts` |
| **Runtime is `tsx`** | Dev: `npm run dev` (`tsx watch server.js`). Prod: the Dockerfile runs `npx tsx server.js`. **Never run server entrypoints with plain `node`** — once the require graph contains a `.ts` file, plain `node` crashes |
| **Type-check before finishing** | Run `npm run typecheck` (`tsc --noEmit`) after any change that adds or edits a `.ts` file — it must pass with zero errors |
| **Strict mode** | `tsconfig.json` has `strict: true` for `.ts` files. No `any` unless genuinely unavoidable — prefer `unknown` + narrowing |
| **ESM syntax in `.ts` files** | Use `import` / `export` in TypeScript files (tsx compiles them to CommonJS). Existing `.js` files keep `require` / `module.exports` |
| **Tests may be `.ts`** | Jest is configured with `ts-jest`; test files match `*.spec.@(js|ts)`. New test files are `.spec.ts` |

#### Incremental Migration Policy (existing `.js` code)

This codebase is migrating from JavaScript incrementally (`allowJs: true`, `checkJs: false`). The rules:

- Existing `.js` files keep working — do **not** mass-convert unrelated files.
- When **substantially modifying** an existing `.js` file (new methods, changed signatures, reworked logic), convert it to `.ts` in the same change: rename, switch to `import`/`export`, add types, run `npm run typecheck` + the Jest suite.
- Small fixes (a one-line bugfix, a log message) do not require conversion.
- A converted file must keep its exact export shape (`export { X }` compiles to `module.exports.X`), so `.js` consumers that `require()` it continue to work unchanged.

---

## 2. Layered Architecture

```
Inbound Request
      ↓
[ Validation Middleware ]   ← Schema validation (Zod / class-validator). Request is REJECTED here if invalid.
      ↓
[ Auth Middleware ]         ← JWT verification, token decode, user attach to request context.
      ↓
[ Authorization Guard ]    ← Role / permission / ownership check.
      ↓
[ Controller ]             ← Thin coordinator. Reads validated input, calls service, returns response.
      ↓
[ Service ]                ← All business logic, workflows, domain rules.
      ↓
[ Repository ]             ← All data access. Indexed queries, pagination, transactions.
      ↓
[ Model / Entity ]         ← ORM entity definition. Columns, indexes, relations. Owned exclusively by the repository.
      ↓
[ Database ]
      ↓
[ Response Builder ]       ← Standardised envelope returned to client.
```

No layer may skip another. No layer may reach downward past its direct dependency.

### Layer Ownership Rules

| Layer | Owns | Must NOT |
|---|---|---|
| **Validation Middleware** | Schema shape, type coercion, field rules | Touch business logic or DB |
| **Auth Middleware** | Token verification, `req.user` population | Make business decisions |
| **Authorization Guard** | Role/permission enforcement | Query DB directly |
| **Controller** | Request coordination, response formatting | Contain business logic or DB calls |
| **Service** | Business rules, workflows, domain validation | Import entities, handle HTTP |
| **Repository** | All DB queries, persistence, transactions | Contain business logic |
| **Model / Entity** | Table structure, column types, indexes, relations | Contain methods with business logic |
| **DTO** | Input/output data shapes across layer boundaries | Reference entity classes directly |

---

## 3. Folder Structure (Domain-Driven)

```
src/
 ├── modules/
 │    ├── auth/
 │    │    ├── controllers/       auth.controller.ts
 │    │    ├── services/          auth.service.ts
 │    │    ├── repositories/      auth.repository.ts
 │    │    ├── validators/        auth.schema.ts
 │    │    ├── dto/               auth.dto.ts
 │    │    ├── interfaces/        auth.interface.ts
 │    │    ├── tests/             auth.service.spec.ts
 │    │    └── routes/            auth.routes.ts
 │    │
 │    ├── patient/
 │    ├── billing/
 │    ├── inventory/
 │    └── [domain]/
 │
 ├── shared/
 │    ├── middleware/
 │    │    ├── validate.middleware.ts
 │    │    ├── auth.middleware.ts
 │    │    └── rateLimiter.middleware.ts
 │    ├── response/
 │    │    └── apiResponse.ts
 │    ├── errors/
 │    │    └── AppError.ts
 │    ├── pagination/
 │    │    └── paginate.ts
 │    └── utils/
 │
 ├── infrastructure/
 │    ├── database/
 │    │    ├── dataSource.ts
 │    │    └── migrations/
 │    └── cache/
 │         └── redis.ts
 │
 ├── config/
 │    ├── env.ts
 │    └── constants.ts
 │
 └── app.ts
```

**Rule:** Features grow inside `modules/`. Shared cross-cutting concerns live in `shared/`. Infrastructure wiring lives in `infrastructure/`.

---

## 4. Validation Layer (Before the Controller)

> This is the most important addition to the standard flow. **The controller must receive clean, typed, guaranteed-safe data.** Validation is middleware — it runs before the controller function body executes.

### 4.1 Validation Middleware Factory

```typescript
// shared/middleware/validate.middleware.ts
import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { ApiResponse } from "../response/apiResponse";

export const validate =
  (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      res.status(422).json(
        ApiResponse.error(
          "Validation failed",
          422,
          formatZodErrors(result.error)
        )
      );
      return;
    }

    req.validated = result.data;
    next();
  };

function formatZodErrors(error: ZodError) {
  return error.errors.map((e) => ({
    field: e.path.join("."),
    message: e.message,
  }));
}
```

### 4.2 Schema Definition (Zod)

```typescript
// modules/patient/validators/patient.schema.ts
import { z } from "zod";

export const createPatientSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    dateOfBirth: z.string().datetime(),
    gender: z.enum(["male", "female", "other"]),
    phone: z.string().regex(/^\+?[0-9]{7,15}$/),
  }),
});

export const fetchPatientsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
    search: z.string().optional(),
  }),
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>["body"];
export type FetchPatientsQuery = z.infer<typeof fetchPatientsSchema>["query"];
```

### 4.3 Route Wiring — Validation Before Controller

```typescript
// modules/patient/routes/patient.routes.ts
import { Router } from "express";
import { validate } from "../../../shared/middleware/validate.middleware";
import { authMiddleware } from "../../../shared/middleware/auth.middleware";
import { authorise } from "../../../shared/middleware/authorise.middleware";
import { createPatientSchema, fetchPatientsSchema } from "../validators/patient.schema";
import { PatientController } from "../controllers/patient.controller";

const router = Router();

router.get(
  "/",
  authMiddleware,
  validate(fetchPatientsSchema),
  PatientController.fetchAll
);

router.post(
  "/",
  authMiddleware,
  authorise("admin", "staff"),
  validate(createPatientSchema),
  PatientController.create
);

export default router;
```

**Flow:** `authMiddleware` → `validate(schema)` → controller. If validation fails at the middleware, the controller is **never called**.

---

## 5. Standard Response Envelope

Every response — success or error — must use the same shape. This allows web and mobile clients to apply a single parser.

```typescript
// shared/response/apiResponse.ts
export class ApiResponse<T = null> {
  constructor(
    public readonly success: boolean,
    public readonly message: string,
    public readonly statusCode: number,
    public readonly data: T | null = null,
    public readonly errors: unknown[] = [],
    public readonly meta?: PaginationMeta
  ) {}

  static ok<T>(message: string, data: T, meta?: PaginationMeta) {
    return new ApiResponse(true, message, 200, data, [], meta);
  }

  static created<T>(message: string, data: T) {
    return new ApiResponse(true, message, 201, data);
  }

  static error(message: string, statusCode = 400, errors: unknown[] = []) {
    return new ApiResponse(false, message, statusCode, null, errors);
  }
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
```

---

## 6. Controller Standards

Controllers are **thin coordinators only**. They read from `req.validated` (guaranteed safe by middleware), call the service, and return a response.

```typescript
// modules/patient/controllers/patient.controller.ts
import { Request, Response } from "express";
import { PatientService } from "../services/patient.service";
import { ApiResponse } from "../../../shared/response/apiResponse";

export class PatientController {
  static async fetchAll(req: Request, res: Response): Promise<void> {
    try {
      const { page, limit, cursor, search } = req.validated.query;
      const ownerId = req.user.id;

      const result = await PatientService.Instance.fetchPatients({
        ownerId,
        page,
        limit,
        cursor,
        search,
      });

      res.status(200).json(
        ApiResponse.ok("Patients fetched", result.data, result.meta)
      );
    } catch (error) {
      res.status(500).json(ApiResponse.error("Internal server error", 500));
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const patient = await PatientService.Instance.createPatient(
        req.user.id,
        req.validated.body
      );

      res.status(201).json(ApiResponse.created("Patient created", patient));
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json(ApiResponse.error(error.message, error.statusCode));
        return;
      }
      res.status(500).json(ApiResponse.error("Internal server error", 500));
    }
  }
}
```

### Controller Rules

| Rule | Requirement |
|---|---|
| Never contains business logic | Delegate everything to service |
| Reads only from `req.validated` | Never read raw `req.body` directly |
| Returns `ApiResponse` | No ad-hoc JSON shapes |
| Catches `AppError` separately | Domain errors vs infrastructure errors |
| No database calls | Not even via helper functions |

---

## 7. Service Layer (Business Logic)

```typescript
// modules/patient/services/patient.service.ts
import { PatientRepository } from "../repositories/patient.repository";
import { ActivityRepository } from "../../activity/repositories/activity.repository";
import { AppError } from "../../../shared/errors/AppError";
import { CreatePatientInput, FetchPatientsQuery } from "../validators/patient.schema";

export class PatientService {
  static Instance = new PatientService();

  private constructor(
    private readonly patientRepo = PatientRepository.Instance,
    private readonly activityRepo = ActivityRepository.Instance
  ) {}

  async fetchPatients(params: FetchPatientsQuery & { ownerId: string }) {
    return this.patientRepo.fetchPaginated(params);
  }

  async createPatient(ownerId: string, data: CreatePatientInput) {
    const existing = await this.patientRepo.findByPhone(ownerId, data.phone);

    if (existing) {
      throw new AppError("A patient with this phone number already exists", 409);
    }

    const patient = await this.patientRepo.create({ ...data, ownerId });

    await this.activityRepo.log({
      ownerId,
      action: "patient.created",
      entityId: patient.id,
    });

    return patient;
  }
}
```

### Service Rules

| Rule | Description |
|---|---|
| **Singleton** | `static Instance = new PatientService()` |
| **Inject dependencies via constructor** | Enables testing and substitution |
| **Throws `AppError`** | Never throws raw errors with internal details |
| **Coordinates repos** | Calls multiple repos when workflows require it |
| **No HTTP concerns** | No `req`, `res`, status codes |
| **No raw queries** | Always delegates to repository |

---

## 8. Repository Layer (Data Access & Indexing)

This is where all database interaction lives. Every method must be:
- Optimised (indexed fields only in `WHERE` clauses)
- Paginated for list queries
- Transaction-safe for writes involving multiple tables

### 8.1 Base Repository (Reusable Core)

```typescript
// shared/repositories/baseRepository.ts
import { DataSource, EntityTarget, FindOptionsWhere, Repository } from "typeorm";

export abstract class BaseRepository<T extends { id: string }> {
  protected repo: Repository<T>;

  constructor(entity: EntityTarget<T>, dataSource: DataSource) {
    this.repo = dataSource.getRepository(entity);
  }

  async findById(id: string): Promise<T | null> {
    return this.repo.findOne({ where: { id } as FindOptionsWhere<T> });
  }

  async save(entity: Partial<T>): Promise<T> {
    return this.repo.save(entity as T);
  }

  async count(where?: FindOptionsWhere<T>): Promise<number> {
    return this.repo.count({ where });
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }
}
```

### 8.2 Domain Repository with Optimised Queries

```typescript
// modules/patient/repositories/patient.repository.ts
import { AppDataSource } from "../../../infrastructure/database/dataSource";
import { Patient } from "../entities/patient.entity";
import { BaseRepository } from "../../../shared/repositories/baseRepository";
import { FetchPatientsQuery } from "../validators/patient.schema";
import { PaginationMeta } from "../../../shared/response/apiResponse";

export class PatientRepository extends BaseRepository<Patient> {
  static Instance = new PatientRepository();

  private constructor() {
    super(Patient, AppDataSource);
  }

  // ─── Indexed offset-based pagination ────────────────────────────────────────
  async fetchPaginated(
    params: FetchPatientsQuery & { ownerId: string }
  ): Promise<{ data: Patient[]; meta: PaginationMeta }> {
    const { ownerId, page, limit, search } = params;
    const offset = (page - 1) * limit;

    const qb = this.repo
      .createQueryBuilder("patient")
      .where("patient.ownerId = :ownerId", { ownerId })   // indexed column
      .andWhere("patient.deletedAt IS NULL")
      .orderBy("patient.createdAt", "DESC")
      .skip(offset)
      .take(limit);

    if (search) {
      qb.andWhere(
        "(patient.firstName ILIKE :search OR patient.lastName ILIKE :search OR patient.phone ILIKE :search)",
        { search: `%${search}%` }
      );
    }

    // Count only on first page — avoid expensive COUNT on every page
    let total = 0;
    if (page === 1) {
      total = await qb.getCount();
    }

    const data = await qb.getMany();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: data.length === limit,
        hasPrev: page > 1,
      },
    };
  }

  // ─── Cursor-based pagination (mobile / infinite scroll) ─────────────────────
  async fetchWithCursor(
    ownerId: string,
    limit: number,
    cursor?: string
  ): Promise<{ data: Patient[]; nextCursor: string | null }> {
    const qb = this.repo
      .createQueryBuilder("patient")
      .where("patient.ownerId = :ownerId", { ownerId })
      .andWhere("patient.deletedAt IS NULL")
      .orderBy("patient.createdAt", "DESC")
      .take(limit + 1); // fetch one extra to determine if there's a next page

    if (cursor) {
      // cursor encodes the createdAt of the last seen row
      const cursorDate = Buffer.from(cursor, "base64").toString("utf8");
      qb.andWhere("patient.createdAt < :cursor", { cursor: cursorDate });
    }

    const rows = await qb.getMany();
    const hasNext = rows.length > limit;
    const data = hasNext ? rows.slice(0, limit) : rows;

    const nextCursor = hasNext
      ? Buffer.from(data[data.length - 1].createdAt.toISOString()).toString("base64")
      : null;

    return { data, nextCursor };
  }

  async findByPhone(ownerId: string, phone: string): Promise<Patient | null> {
    return this.repo.findOne({
      where: { ownerId, phone },   // composite index: (ownerId, phone)
      select: ["id"],              // only fetch the id — fast existence check
    });
  }

  async create(data: Partial<Patient>): Promise<Patient> {
    const patient = this.repo.create(data);
    return this.repo.save(patient);
  }
}
```

### 8.3 Repository Rules

| Rule | Description |
|---|---|
| **No business logic** | Fetch, persist, delete — nothing else |
| **Always paginate lists** | Never return unbounded arrays |
| **Query only indexed fields** | `WHERE` clauses must target indexed columns |
| **Select only required fields** | Never `SELECT *` when only a few fields are needed |
| **Avoid N+1** | Use `leftJoinAndSelect` or batch loading |
| **Transactions for multi-step writes** | Use `queryRunner` for atomicity |

---

## 9. Model / Entity Layer

> The Model is the **single source of truth for the database schema**. It defines table structure, column types, constraints, relationships, and indexes. It lives inside the module's `entities/` folder and is **exclusively owned by the repository**. No other layer imports or instantiates an entity directly.

### 9.1 Where the Model Lives

```
modules/
 └── patient/
      ├── entities/
      │    └── patient.entity.ts    ← THE MODEL
      ├── repositories/             ← only layer that imports the entity
      ├── services/                 ← works with DTOs, never entity class
      ├── controllers/              ← works with DTOs, never entity class
      └── dto/
           └── patient.dto.ts       ← shapes data in/out across boundaries
```

### 9.2 Model Rules

| Rule | Requirement |
|---|---|
| **Owned by the repository** | Only `patient.repository.ts` imports `Patient` entity |
| **No business logic in entities** | Entities are plain data structures — no methods that enforce rules |
| **All indexes declared here** | `@Index` decorators define DB indexes at the entity level |
| **Soft delete always** | Use `@DeleteDateColumn()` — never hard-delete rows |
| **DTOs are separate** | An entity is a DB mirror; a DTO is a data contract. Never use one as the other. |
| **Relations are explicit** | Declare `@OneToMany`, `@ManyToOne` etc. — never implicit joins |

### 9.3 Standard Entity Template

> **This codebase's convention:** existing entities use TypeORM's **`EntitySchema`** style, not the decorator style shown below. When adding or converting an entity here, follow the existing convention — define an exported interface and type the schema with it, in a `.ts` file:
>
> ```typescript
> // modules/testSuite/entities/testSuite.entity.ts
> import { EntitySchema } from "typeorm";
>
> export interface TestSuite {
>   id: string;
>   name: string;
>   projectId: string;
>   createdAt: Date;
>   deletedAt: Date | null;
>   project?: unknown; // tighten once the related entity is converted
> }
>
> const TestSuite = new EntitySchema<TestSuite>({
>   name: "TestSuite",
>   tableName: "test_suites",
>   columns: { /* columns, indexes as data — same rules as below */ },
> });
>
> export { TestSuite };
> ```
>
> The decorator template below applies to greenfield projects scaffolded from this guide. Do not mix both styles in one codebase, and do not convert `EntitySchema` entities to decorators as a side effect of other work. The rules in §9.2 (repository ownership, no business logic, all indexes declared on the entity, soft delete) apply identically to both styles.

```typescript
// modules/patient/entities/patient.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";

@Entity("patients")
// ── Compound indexes for the most common query patterns ──────────────────────
@Index(["ownerId", "deletedAt"])              // all owner-scoped soft-delete queries
@Index(["ownerId", "createdAt"])              // pagination ordering
@Index(["ownerId", "phone"], { unique: true }) // unique constraint + lookup speed
export class Patient {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // ── Tenant / ownership ──────────────────────────────────────────────────────
  @Column()
  @Index()                                    // single-column index for joins
  ownerId: string;

  // ── Core fields ─────────────────────────────────────────────────────────────
  @Column({ length: 100 })
  firstName: string;

  @Column({ length: 100 })
  lastName: string;

  @Column({ length: 20 })
  phone: string;

  @Column({ type: "varchar", length: 10 })
  gender: string;

  @Column({ type: "date" })
  dateOfBirth: Date;

  // ── Status — index if frequently filtered ───────────────────────────────────
  @Column({ default: "active" })
  @Index()
  status: string;

  // ── Audit timestamps ────────────────────────────────────────────────────────
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()                         // soft delete — never hard delete
  deletedAt: Date | null;
}
```

### 9.4 DTO vs Entity — Clear Distinction

```typescript
// ✅ Entity — mirrors the DB table
// modules/patient/entities/patient.entity.ts
@Entity("patients")
export class Patient {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column() firstName: string;
  @Column() ownerId: string;
  @DeleteDateColumn() deletedAt: Date | null;
  // ... all DB columns
}

// ✅ DTO — data contract between layers (input)
// modules/patient/dto/patient.dto.ts
export interface CreatePatientDTO {
  firstName: string;
  lastName: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
}

// ✅ DTO — data contract between layers (output / response)
export interface PatientResponseDTO {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: string;
  createdAt: string;
}
```

**The service and controller only ever see DTOs. The repository translates between DTOs and the entity.**

### 9.5 What Belongs in a Model vs Elsewhere

| Belongs in Entity | Does NOT belong in Entity |
|---|---|
| Column definitions | Business validation logic |
| Index decorators | Domain rules (`if status === "active"`) |
| Relation decorators | Service calls |
| Lifecycle hooks (`@BeforeInsert`) for low-level DB concerns only | HTTP or framework imports |
| Default values (`default: "active"`) | Data transformation methods |

---

## 10. Database Indexing Standards

> Indexes are the single biggest lever for query performance. Every indexed column must be intentional.

### 9.1 Entity with Indexes

```typescript
// modules/patient/entities/patient.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, DeleteDateColumn, Index, ManyToOne
} from "typeorm";

@Entity("patients")
@Index(["ownerId", "deletedAt"])          // compound — owner scoped soft-delete queries
@Index(["ownerId", "phone"], { unique: true }) // uniqueness + lookup speed
@Index(["ownerId", "createdAt"])          // pagination ordering
export class Patient {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  @Index()
  ownerId: string;

  @Column({ length: 100 })
  firstName: string;

  @Column({ length: 100 })
  lastName: string;

  @Column({ length: 20 })
  phone: string;

  @Column()
  gender: string;

  @Column({ type: "date" })
  dateOfBirth: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
```

### 9.2 Indexing Rules

| Scenario | Index Strategy |
|---|---|
| Tenant / owner scoped queries | `@Index(["ownerId"])` on every tenant-scoped entity |
| Paginated list by date | `@Index(["ownerId", "createdAt"])` |
| Unique lookups (phone, email, code) | `@Index(["ownerId", "field"], { unique: true })` |
| Foreign key joins | Always index foreign key columns |
| Search fields (full-text) | Use `GIN` index on `tsvector` column or dedicated search service |
| Status-filtered queries | `@Index(["ownerId", "status"])` if status is queried frequently |

### 9.3 Anti-patterns to Avoid

```typescript
// BAD — no index on ownerId, full table scan
.where("firstName = :name", { name })

// BAD — function on indexed column breaks the index
.where("LOWER(email) = :email", { email })

// GOOD — use a stored lowercase column or case-insensitive collation
.where("patient.emailLower = :email", { email: email.toLowerCase() })

// BAD — SELECT * fetches unnecessary columns
this.repo.find({ where: { ownerId } })

// GOOD — select only what is needed
this.repo.find({ where: { ownerId }, select: ["id", "firstName", "lastName", "phone"] })
```

---

## 11. Pagination Standards

Two patterns are supported. Choose based on the client's use case:

| Pattern | Use When |
|---|---|
| **Offset-based** | Web tables, admin panels, fixed page navigation |
| **Cursor-based** | Mobile feeds, infinite scroll, real-time lists |

### 10.1 Offset Pagination Helper

```typescript
// shared/pagination/paginate.ts
export interface PaginationParams {
  page: number;
  limit: number;
}

export function getOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

export function buildMeta(
  page: number,
  limit: number,
  total: number,
  resultCount: number
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNext: resultCount === limit,
    hasPrev: page > 1,
  };
}
```

### 10.2 Standard Query Pattern

```typescript
// Always: skip → offset, take → limit
const offset = (page - 1) * limit;

const [data, total] = await this.repo.findAndCount({
  where: { ownerId },
  order: { createdAt: "DESC" },
  skip: offset,
  take: limit,
  select: ["id", "firstName", "lastName", "createdAt"],
});
```

**Rule:** `COUNT` is only fetched on page 1. Pages 2+ skip the `COUNT` query to avoid expensive aggregations.

---

## 12. Error Handling

### 11.1 AppError — Domain Errors

```typescript
// shared/errors/AppError.ts
export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 400,
    public readonly errors: unknown[] = []
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
```

### 11.2 Global Error Handler Middleware

```typescript
// shared/middleware/errorHandler.middleware.ts
import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";
import { ApiResponse } from "../response/apiResponse";

export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(
      ApiResponse.error(err.message, err.statusCode, err.errors)
    );
    return;
  }

  // Never expose internal error details to the client
  console.error("[Unhandled Error]", err);
  res.status(500).json(ApiResponse.error("Internal server error", 500));
}
```

### 11.3 Rules

| Rule | Requirement |
|---|---|
| **Never expose stack traces** | Only `message` reaches the client |
| **AppError for domain failures** | Conflict, Not Found, Forbidden |
| **500 for infrastructure failures** | DB down, unexpected exceptions |
| **Consistent envelope** | Always `ApiResponse` |
| **Log internally** | Log full error server-side, return safe message to client |

---

## 13. Security Standards

### 12.1 Authentication Middleware

```typescript
// shared/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ApiResponse } from "../response/apiResponse";

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    res.status(401).json(ApiResponse.error("Unauthorised", 401));
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json(ApiResponse.error("Token invalid or expired", 401));
  }
}
```

### 12.2 Authorisation Guard

```typescript
// shared/middleware/authorise.middleware.ts
export function authorise(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!roles.includes(req.user?.role)) {
      res.status(403).json(ApiResponse.error("Forbidden", 403));
      return;
    }
    next();
  };
}
```

### 12.3 Security Checklist

| Requirement | Standard |
|---|---|
| Parameterised queries | Always — never string concatenation |
| JWT validation | On every protected route |
| Role-based access | `authorise()` guard on write endpoints |
| Rate limiting | `express-rate-limit` on auth and sensitive endpoints |
| Input sanitisation | Handled by Zod schema before controller |
| Environment secrets | `.env` only — never hardcoded |
| Secure headers | `helmet` middleware on all routes |
| CORS | Explicit allowlist — never wildcard `*` in production |

---

## 14. API Versioning (Web + Mobile Compatible)

```typescript
// app.ts
app.use("/api/v1/patients", patientRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/billing", billingRoutes);
```

**Rules:**
- All routes are prefixed with `/api/v1/`
- Breaking changes bump the version: `/api/v2/`
- Old versions remain live until clients have migrated
- No platform-specific routes — the same endpoint serves web and mobile
- Mobile clients signal their platform via `X-Client-Platform: mobile` header if platform-specific behaviour is ever needed, handled at service level, never at route level

---

## 15. Naming Conventions

### Files
```
patient.controller.ts
patient.service.ts
patient.repository.ts
patient.schema.ts         ← validation schemas
patient.dto.ts            ← TypeScript types / interfaces
patient.entity.ts         ← ORM entity
patient.routes.ts
```

### Classes
```typescript
export class PatientController {}
export class PatientService {}
export class PatientRepository {}
```

### Singleton
```typescript
static Instance = new PatientService();
```

### Repository Methods
```typescript
fetchPaginated(params)
fetchWithCursor(ownerId, limit, cursor)
findById(id)
findByPhone(ownerId, phone)
create(data)
update(id, data)
softDelete(id)
upsert(data, conflictKeys)
```

### Service Methods
```typescript
fetchPatients(params)
createPatient(ownerId, data)
updatePatient(ownerId, id, data)
deletePatient(ownerId, id)
```

---

## 16. Feature Scaffold Checklist

When scaffolding a new domain (e.g. `appointment`), complete in this exact order:

```
[ ] 1.  Create Model / Entity with @Index decorators        modules/appointment/entities/appointment.entity.ts
[ ]      — define all columns, compound indexes, soft-delete, relations
[ ] 2.  Write database migration                            infrastructure/database/migrations/
[ ] 3.  Create DTOs (input + response)                     modules/appointment/dto/appointment.dto.ts
[ ]      — CreateAppointmentDTO, AppointmentResponseDTO
[ ] 4.  Write Zod validation schemas                       modules/appointment/validators/appointment.schema.ts
[ ]      — createAppointmentSchema, fetchAppointmentsSchema (with pagination query)
[ ] 5.  Implement Repository                               modules/appointment/repositories/appointment.repository.ts
[ ]      — extends BaseRepository<Appointment>
[ ]      — fetchPaginated(), fetchWithCursor(), findById(), create(), softDelete()
[ ]      — all WHERE clauses must target indexed columns only
[ ] 6.  Implement Service                                  modules/appointment/services/appointment.service.ts
[ ]      — static Instance singleton
[ ]      — all business logic, domain rules, multi-repo coordination
[ ]      — throws AppError for domain failures
[ ] 7.  Implement Controller (thin)                        modules/appointment/controllers/appointment.controller.ts
[ ]      — reads only from req.validated
[ ]      — returns ApiResponse envelope
[ ] 8.  Wire routes with full middleware chain             modules/appointment/routes/appointment.routes.ts
[ ]      — authMiddleware → authorise() → validate(schema) → controller
[ ] 9.  Register routes in app.ts                          /api/v1/appointments
[ ] 10. Write unit tests for service                       modules/appointment/tests/appointment.service.spec.ts
[ ] 11. Write integration tests for repository             modules/appointment/tests/appointment.repository.spec.ts
[ ] 12. Update the Postman collection                      postman/<App>.postman_collection.json
[ ]      — add one request per new endpoint, grouped in a module folder
[ ]      — add a saved example response for EVERY status code the endpoint returns
[ ]      — add post-response scripts to capture ids/tokens into collection variables
```

---

## 17. File Size Limits

| Layer | Max Lines |
|---|---|
| Controller | 200 |
| Service | 400 |
| Repository | 400 |
| Model / Entity | 120 — columns, indexes, relations only. No logic. |
| DTO file | 150 |
| Validator/Schema | 150 |
| Utility | 200 |

If a file exceeds these limits, split by sub-domain:
```
patient.service.ts
patient.billing.service.ts
patient.appointment.service.ts
```

---

## 18. SOLID Application Guide

| Principle | Applied As |
|---|---|
| **S** — Single Responsibility | One class = one domain. One method = one action. |
| **O** — Open/Closed | Extend behaviour via new services/strategies, never modify existing working code. |
| **L** — Liskov Substitution | Repository implementations can be swapped (e.g. TypeORM → Prisma) without changing service code. |
| **I** — Interface Segregation | Services receive only what they need via constructor injection, not a god-context object. |
| **D** — Dependency Inversion | Services depend on repository interfaces, not concrete implementations. |

---

## 19. AI Agent Mandatory Rules

AI agents building features in this codebase MUST:

- Write **every new file in TypeScript** (`.ts`) — no new `.js` files, ever (see §1.1)
- Run `npm run typecheck` (`tsc --noEmit`) and the Jest suite before declaring any change complete
- Convert an existing `.js` file to `.ts` when substantially modifying it (§1.1 migration policy)
- Run all Node entrypoints (server, seeds, TypeORM CLI) through `tsx` — never plain `node`
- Follow the scaffold checklist in Section 16 in order — **starting with the Model/Entity**
- Define all `@Index` decorators on the entity before writing any repository queries
- Create a migration immediately after defining the entity
- Keep entities as pure data structures — columns, indexes, relations only
- Only import the entity class inside the repository — never in services or controllers
- Use DTOs as the data contract between all other layers
- Never read `req.body` directly in a controller — always `req.validated`
- Never write queries without indexes on `WHERE` fields
- Never return list endpoints without pagination
- Never place business logic in a controller or repository
- Never hardcode secrets or connection strings
- Never skip the validation middleware on a route
- Never expose raw error messages to the client
- Always use the `ApiResponse` envelope for every response
- Always use the singleton pattern for services and repositories
- Always update the Postman collection in the same change as the endpoint — one request per endpoint, one saved example response per status code (see Section 21)

AI agents MUST NOT:

- Create a new `.js` file for any reason — new code is TypeScript only
- Use `any` where a real type, a generic, or `unknown` + narrowing would work
- Convert entities from `EntitySchema` style to decorator style (or vice versa) as a side effect of other work (§9.3)
- Create a new utility if an equivalent already exists in `shared/`
- Bypass the repository and query the database directly from a service
- Import an entity class in a service or controller
- Use `find()` without `take` / `limit` on any query that can return multiple rows
- Skip writing the entity `@Index` decorators
- Use `SELECT *` — always specify required columns
- Place business methods or domain logic inside an entity class

---

## 20. File Upload & Cloud Storage (Cloudinary)

> File uploads extend the standard request stack with two additional layers: an **Upload Middleware** that parses the multipart body and enforces file rules, and a **StorageService** that owns all Cloudinary interaction. Neither the controller nor domain services ever touch the Cloudinary SDK directly.

### 20.1 Extended Request Stack

```
Inbound Multipart Request
      ↓
[ Upload Middleware ]     ← multer — parses multipart, validates MIME type + size, attaches req.file / req.files
      ↓
[ Validation Middleware ] ← Zod — validates non-file fields (body, query, params)
      ↓
[ Auth Middleware ]
      ↓
[ Controller ]           ← reads req.file.buffer + req.validated, calls service
      ↓
[ Service ]              ← calls StorageService, then repository
      ↓
[ StorageService ]       ← the ONLY layer that talks to Cloudinary
      ↓
[ Repository ]           ← persists the returned URL + publicId to the DB
      ↓
[ Cloudinary ]
```

### 20.2 Folder Structure Additions

```
src/
 ├── infrastructure/
 │    └── storage/
 │         └── cloudinaryClient.ts   ← SDK init (one configured instance)
 │
 ├── shared/
 │    ├── middleware/
 │    │    └── upload.middleware.ts  ← multer factory (uploadSingle / uploadMany)
 │    └── services/
 │         └── storage.service.ts   ← upload, delete, replaceImage
```

### 20.3 Infrastructure — Cloudinary Client

```typescript
// infrastructure/storage/cloudinaryClient.ts
import { v2 as cloudinary } from "cloudinary";
import { env } from "../../config/env";

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
  secure: true,
});

export { cloudinary };
```

**Rule:** This file is the only place `cloudinary.config()` is called. All other files import the configured `cloudinary` object from here — never configure it inline.

### 20.4 Upload Middleware Factory

```typescript
// shared/middleware/upload.middleware.ts
import multer, { FileFilterCallback } from "multer";
import { Request } from "express";
import { AppError } from "../errors/AppError";

const memoryStorage = multer.memoryStorage();
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function imageFileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError("Only JPEG, PNG, WebP, and GIF images are allowed", 422));
  }
}

export function uploadSingle(field: string, maxMb = 5) {
  return multer({
    storage: memoryStorage,
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: imageFileFilter,
  }).single(field);
}

export function uploadMany(field: string, maxCount = 10, maxMb = 5) {
  return multer({
    storage: memoryStorage,
    limits: { fileSize: maxMb * 1024 * 1024, files: maxCount },
    fileFilter: imageFileFilter,
  }).array(field, maxCount);
}
```

**Rules:**
- Always use `memoryStorage` — files must never be written to disk on the server
- MIME type is validated in `fileFilter` before the controller sees the request
- Size limits are enforced by multer before the buffer reaches the service

### 20.5 StorageService

```typescript
// shared/services/storage.service.ts
import { UploadApiOptions } from "cloudinary";
import { cloudinary } from "../../infrastructure/storage/cloudinaryClient";
import { AppError } from "../errors/AppError";

export interface UploadResult {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  format: string;
  bytes: number;
}

export interface UploadOptions {
  folder: string;
  publicId?: string;
  transformation?: UploadApiOptions["transformation"];
  maxDimension?: number;
}

export class StorageService {
  static Instance = new StorageService();
  private constructor() {}

  async uploadImage(buffer: Buffer, options: UploadOptions): Promise<UploadResult> {
    const maxDimension = options.maxDimension ?? 2000;
    const uploadOptions: UploadApiOptions = {
      folder: options.folder,
      public_id: options.publicId,
      resource_type: "image",
      overwrite: true,
      transformation: options.transformation ?? [
        { width: maxDimension, height: maxDimension, crop: "limit" },
        { quality: "auto", fetch_format: "auto" },
      ],
    };

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error || !result) { reject(new AppError("File upload failed", 500)); return; }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes,
        });
      });
      stream.end(buffer);
    });
  }

  async deleteImage(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  }

  // Upload new → then delete old. A failed upload never leaves the record imageless.
  async replaceImage(buffer: Buffer, options: UploadOptions, oldPublicId?: string): Promise<UploadResult> {
    const result = await this.uploadImage(buffer, options);
    if (oldPublicId && oldPublicId !== result.publicId) {
      await this.deleteImage(oldPublicId).catch(() => {});
    }
    return result;
  }
}
```

### 20.6 Route Wiring — Upload Before Validation

```typescript
// modules/product/routes/product.routes.ts
import { uploadSingle } from "../../../shared/middleware/upload.middleware";

router.post(
  "/",
  authMiddleware,
  authorise(UserRole.ADMIN),
  uploadSingle("image"),          // ① parse + validate the file
  validate(createProductSchema),  // ② validate non-file fields
  ProductController.create
);

router.patch(
  "/:id/image",
  authMiddleware,
  authorise(UserRole.ADMIN),
  uploadMany("images", 5),        // ① up to 5 images
  validate(productIdParamSchema), // ② validate params
  ProductController.uploadImages
);
```

**Order is fixed:** `uploadSingle/uploadMany` → `validate` → controller. The file middleware must run first to parse the multipart body; otherwise `req.body` is empty and Zod validation fails.

### 20.7 Controller — Reading the File

```typescript
// modules/product/controllers/product.controller.ts
static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // req.file is guaranteed by uploadSingle — if missing, multer already rejected it.
    const product = await ProductService.Instance.createProduct(
      req.user!.id,
      req.validated.body,
      req.file!.buffer,           // raw buffer — never a file path
    );
    res.status(201).json(ApiResponse.created("Product created", product));
  } catch (err) {
    next(err);
  }
}

// Multi-file variant
static async uploadImages(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = req.files as Express.Multer.File[];
    const buffers = files.map((f) => f.buffer);
    const result = await ProductService.Instance.uploadImages(req.validated.params.id, buffers);
    res.status(200).json(ApiResponse.ok("Images uploaded", result));
  } catch (err) {
    next(err);
  }
}
```

### 20.8 Service Layer — Upload + Persist

```typescript
// modules/product/services/product.service.ts
import { StorageService } from "../../../shared/services/storage.service";

export class ProductService {
  static Instance = new ProductService();

  private constructor(
    private readonly productRepo = ProductRepository.Instance,
    private readonly storage = StorageService.Instance
  ) {}

  async createProduct(ownerId: string, data: CreateProductDTO, imageBuffer: Buffer) {
    const { url, publicId } = await this.storage.uploadImage(imageBuffer, {
      folder: "labafood/products",
    });

    return this.productRepo.create({ ...data, ownerId, imageUrl: url, imagePublicId: publicId });
  }

  async updateImage(productId: string, buffer: Buffer) {
    const product = await this.productRepo.findById(productId);
    if (!product) throw AppError.notFound("Product not found");

    // Replace atomically — upload succeeds before the old one is deleted.
    const { url, publicId } = await this.storage.replaceImage(
      buffer,
      { folder: "labafood/products" },
      product.imagePublicId ?? undefined
    );

    return this.productRepo.update(productId, { imageUrl: url, imagePublicId: publicId });
  }
}
```

### 20.9 Entity Columns for Cloudinary Assets

Always persist both the CDN URL **and** the `publicId`. The URL is for display; the `publicId` is needed for deletion and transforms.

```typescript
@Column({ name: "image_url", length: 500, nullable: true })
imageUrl: string | null;

// Required for deletion and Cloudinary transformations.
@Column({ name: "image_public_id", length: 255, nullable: true })
imagePublicId: string | null;
```

### 20.10 Environment Variables

```bash
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### 20.11 Naming Conventions

| Layer | Convention | Example |
|---|---|---|
| Infrastructure client | `cloudinaryClient.ts` | `infrastructure/storage/cloudinaryClient.ts` |
| Shared service | `storage.service.ts` | `shared/services/storage.service.ts` |
| Upload middleware | `upload.middleware.ts` | `shared/middleware/upload.middleware.ts` |
| Cloudinary folder | `appname/domain` | `"labafood/products"` |
| Entity columns | `imageUrl` + `imagePublicId` | Persisted together, always |

### 20.12 File Upload Security Checklist

| Requirement | How it's enforced |
|---|---|
| File type validation | `fileFilter` in `upload.middleware.ts` — MIME type checked before controller |
| File size limit | `limits.fileSize` in multer — configurable per route |
| No disk writes | `memoryStorage` — buffer goes directly to Cloudinary |
| No raw paths to client | Only `secure_url` (CDN HTTPS URL) is returned |
| Delete on replace | `replaceImage` uploads first, then destroys old `publicId` |
| Cloudinary folder isolation | Each domain uses its own folder — `labafood/products`, `labafood/profiles` |
| Secrets in env only | `CLOUDINARY_API_SECRET` never hardcoded |

### 20.13 AI Agent Mandatory Rules — File Uploads

AI agents adding file upload to a feature MUST:

- Place `uploadSingle` / `uploadMany` **before** `validate()` in the route chain
- Read `req.file.buffer` in the controller — never a file path
- Pass the buffer to the service — controllers never call `StorageService` directly
- Persist both `imageUrl` and `imagePublicId` in the entity
- Use `replaceImage` (not `uploadImage` + manual delete) when updating an existing asset
- Declare `imagePublicId` columns with `length: 255` and `nullable: true`
- Use domain-scoped Cloudinary folders: `"appname/domain"` (e.g. `"labafood/products"`)

AI agents MUST NOT:

- Import or configure the Cloudinary SDK anywhere except `infrastructure/storage/cloudinaryClient.ts`
- Write files to disk (no `diskStorage`)
- Call `StorageService` from a controller or repository
- Store only the URL without the `publicId` — deletion requires the `publicId`
- Skip the `fileFilter` or `limits` when configuring multer

---

## 21. API Documentation — Postman Collection

> Every project ships a Postman collection that is a **complete, runnable mirror of the API**. It is a first-class deliverable, updated in the same change as the endpoint — never an afterthought. The collection captures every endpoint and a saved example response for **every** status code that endpoint can return.

### 21.1 Where it Lives

```
server/
 └── postman/
      ├── <App>.postman_collection.json    ← the collection (v2.1 schema)
      ├── <App>.postman_environment.json   ← baseUrl + tokens + ids
      └── README.md                        ← import + token-capture instructions
```

### 21.2 Structure Rules

| Rule | Requirement |
|---|---|
| **Schema** | Postman Collection format **v2.1** (`schema: .../collection/v2.1.0/collection.json`) |
| **One folder per module** | Mirror `modules/` — `Auth`, `Admin — Users`, `Products`, … |
| **Collection-level auth** | `Bearer {{accessToken}}`. Public routes override with `"auth": { "type": "noauth" }` |
| **Variables, not literals** | `{{baseUrl}}`, `{{accessToken}}`, `{{refreshToken}}`, `{{userId}}`, resource ids — never hardcoded hosts or tokens |
| **Every response captured** | Each request stores a saved example (`response[]`) for **each** status code it returns — success AND every error (401, 403, 404, 409, 422, 429, …) |
| **Envelope match** | Example bodies must match the real `ApiResponse` envelope exactly: `{ success, message, statusCode, data, errors, meta? }` |
| **Token chaining** | Login / verify / refresh requests carry a post-response `test` script that writes tokens + ids into collection variables, so the whole collection runs top-to-bottom without manual copying |

### 21.3 Capturing Data with Post-Response Scripts

The collection is **self-priming**: running the auth requests populates the variables every later request needs.

```javascript
// Auth > Login / Verify Email — capture tokens + user id
const res = pm.response.json();
if (res.data && res.data.tokens) {
  pm.collectionVariables.set("accessToken", res.data.tokens.accessToken);
  pm.collectionVariables.set("refreshToken", res.data.tokens.refreshToken);
}
if (res.data && res.data.user) pm.collectionVariables.set("userId", res.data.user.id);
```

```javascript
// A create endpoint — capture the new resource id for follow-up requests
const res = pm.response.json();
if (res.data && res.data.id) pm.collectionVariables.set("createdUserId", res.data.id);
```

### 21.4 Saved Example Response Shape

Each entry in a request's `response[]` array:

```json
{
  "name": "409 Email exists",
  "originalRequest": { "method": "POST", "header": [...], "body": {...}, "url": {...} },
  "status": "Conflict",
  "code": 409,
  "header": [{ "key": "Content-Type", "value": "application/json" }],
  "_postman_previewlanguage": "json",
  "body": "{\n  \"success\": false,\n  \"message\": \"An account with this email already exists\",\n  \"statusCode\": 409,\n  \"data\": null,\n  \"errors\": []\n}"
}
```

### 21.5 Deriving the Response Set

For each endpoint, the example responses are derived directly from the layers — there is a one-to-one mapping, so coverage is mechanical, not guesswork:

| Source in code | Produces example |
|---|---|
| Controller success (`ApiResponse.ok` / `.created`) | `200` / `201` |
| Each `AppError.*` the service can throw | `400` / `403` / `404` / `409` … (one per distinct message) |
| `validate(schema)` on the route | `422` Validation failed (with `errors[]`) |
| `authMiddleware` on the route | `401` Unauthorised / Token invalid or expired |
| `authorise(...)` on the route | `403` Forbidden |
| `authRateLimiter` on the route | `429` Too many requests |

### 21.6 AI Agent Mandatory Rules — Postman

AI agents MUST:

- Create `postman/<App>.postman_collection.json` + `<App>.postman_environment.json` during the **first** module scaffold, and extend them on every subsequent module
- Add, for each endpoint, a saved example response for **every** status code that endpoint can return (walk the route's middleware + the service's `AppError` throws — §21.5)
- Make example bodies byte-match the real `ApiResponse` envelope
- Use `{{variables}}` for the base URL, tokens, and ids — never hardcode
- Add post-response scripts that capture tokens/ids so the collection runs end-to-end
- Validate the JSON parses (e.g. `node -e "require('./postman/<App>.postman_collection.json')"`) before finishing

AI agents MUST NOT:

- Ship a collection that only contains the happy-path response
- Hardcode a host, bearer token, or resource id into a request
- Let the collection drift — an endpoint change without a matching collection change is incomplete work

---

## 22. Email Standards

> Every email sent by the system uses the shared `emailLayout()` wrapper in `shared/utils/mailer.ts`. The wrapper owns the brand header, footer, and outer shell. Only the inner `body` HTML changes per email type.

### 22.1 Brand Prompt — Answer These Before Writing Any New Email

Before implementing a new email type, answer all seven questions. They map directly to the implementation.

| # | Question | Maps to |
|---|---|---|
| 1 | **Recipient** — Who receives this? (customer, admin, rider) | `to` argument + personalisation variables |
| 2 | **Trigger** — What event sends it? | Service method that calls the send function |
| 3 | **Subject** — What is the subject line? | Must follow format: `{Purpose} — LabaFood` |
| 4 | **Heading** — What is the email's `<h1>`? | Renders directly below the brand header |
| 5 | **Body copy + variables** — What does the body say, and which values are interpolated? | Every dynamic value becomes a typed function parameter |
| 6 | **CTA** — Is there a call-to-action button? If yes: label and destination URL? | Optional `<a>` button block in the body |
| 7 | **Tone** — Transactional, celebratory, or alerting? | Drives word choice; see §22.4 |

### 22.2 `emailLayout()` — The Shared Wrapper

All email HTML is produced by calling `emailLayout(body)` in `shared/utils/mailer.ts`. It is the only place `<html>` and `<body>` tags appear.

**Layout anatomy:**

```
┌──────────────────────────────────────────┐
│  Dark brand header (#0f172a)             │  Orange "Laba" + white "Food", 24 px bold
│  LabaFood logotype                       │
├──────────────────────────────────────────┤
│                                          │
│  White body card (#ffffff)               │  40 px padding, 560 px max-width
│  <<< body HTML injected here >>>        │
│                                          │
├──────────────────────────────────────────┤
│  Muted footer (#f8fafc)                  │  © year · support@labafood.com
└──────────────────────────────────────────┘
```

**Brand tokens used in the layout:**

| Token | Value | Usage |
|---|---|---|
| Brand dark | `#0f172a` | Header background, heading text, strong emphasis |
| Brand orange | `#f97316` | "Laba" logotype, info-box left border, CTA button, links |
| Body text | `#374151` | All paragraph copy |
| Muted text | `#9ca3af` / `#94a3b8` | Footnotes, footer, disclaimer copy |
| Card border | `#e2e8f0` | Card border, table dividers |
| Surface | `#f8fafc` | Code/OTP box background, info box background, footer |

### 22.3 Body Component Reference

Use only these components inside `emailLayout()`. Do not introduce new inline-style rules.

**Heading — one per email:**
```html
<h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3">Heading text</h1>
```

**Body paragraph:**
```html
<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.65">Copy goes here.</p>
```

**OTP / code box:**
```html
<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:28px 16px;text-align:center;margin:0 0 24px">
  <span style="font-size:42px;font-weight:800;letter-spacing:14px;color:#0f172a;font-family:'Courier New',Courier,monospace">${code}</span>
</div>
```

**Info / detail box (order number, applicant details, etc.):**
```html
<div style="background:#f8fafc;border-left:3px solid #f97316;border-radius:0 6px 6px 0;padding:14px 16px;margin:0 0 24px">
  <p style="margin:0 0 8px;font-size:14px;color:#374151"><strong>Label:</strong> value</p>
  <p style="margin:0;font-size:14px;color:#374151"><strong>Label:</strong> value</p>
</div>
```

**Warning / error box (rejection reason, cancellation notice):**
```html
<div style="background:#fef2f2;border-left:3px solid #ef4444;border-radius:0 6px 6px 0;padding:14px 16px;margin:16px 0">
  <p style="margin:0;font-size:14px;color:#374151"><strong>Reason:</strong> ${reason}</p>
</div>
```

**CTA button — one per email, only when a clear action exists:**
```html
<div style="text-align:center;margin:28px 0">
  <a href="${url}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 36px;border-radius:8px">Button label</a>
</div>
```

**Muted footnote (safety / disclaimer copy):**
```html
<p style="margin:16px 0 0;font-size:13px;color:#9ca3af;line-height:1.6">Muted text here.</p>
```

**Section divider:**
```html
<div style="border-top:1px solid #e5e7eb;margin:24px 0"></div>
```

**Data table — for order line items:**
```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
  <tr>
    <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151">Item — variant &times; qty</td>
    <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;text-align:right;white-space:nowrap">₦subtotal</td>
  </tr>
  <!-- repeat rows -->
  <tr>
    <td style="padding:14px 0 0;font-size:15px;font-weight:700;color:#0f172a">Total</td>
    <td style="padding:14px 0 0;font-size:15px;font-weight:700;color:#0f172a;text-align:right;white-space:nowrap">₦total</td>
  </tr>
</table>
```

### 22.4 Tone Guide

| Tone | When to use | Rules |
|---|---|---|
| **Transactional** | OTP, order status updates, admin notifications | Neutral and factual. No emoji. |
| **Celebratory** | Order confirmed, rider approved | Warm and encouraging. Emoji in `<h1>` is acceptable (`🎉`). |
| **Alerting** | Rider rejected, order cancelled | Empathetic but clear. No emoji. Always state a next step or resolution path. |

### 22.5 Subject Line Convention

```
{Short purpose} — LabaFood
{Short purpose} — {identifier} — LabaFood   (when a unique reference applies)
```

Examples:
```
Verify your email — LabaFood
Reset your password — LabaFood
Order confirmed — #ORD-0042 — LabaFood
Order #ORD-0042 update — LabaFood
New rider application — LabaFood
Your rider application has been approved — LabaFood
```

Rules: title-case the purpose fragment · em dash (`—`) separator · app name always last.

### 22.6 Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Customer email function | `send{Purpose}Email(to, ...)` | `sendOrderConfirmationEmail` |
| Admin notification function | `send{Domain}{Event}Notification(adminEmail, ...)` | `sendAdminNewOrderNotification` |
| Data table helper | Module-scoped `const` returning formatted string | `const naira = (n) => ...` |

### 22.7 File Location & Size Rules

All send functions live in `shared/utils/mailer.ts`. Group by domain with section comments:

```typescript
// ─── OTP ──────────────────────────────────────────────────────────────────────
// ─── Rider lifecycle ──────────────────────────────────────────────────────────
// ─── Order lifecycle ──────────────────────────────────────────────────────────
```

If the file exceeds 400 lines, split by domain — `emailLayout()` and the transport stay in `mailer.ts`:

```
shared/utils/mailer.ts           ← transport, emailLayout, mailer singleton
shared/utils/mail/otp.mail.ts
shared/utils/mail/rider.mail.ts
shared/utils/mail/order.mail.ts
```

### 22.8 AI Agent Mandatory Rules — Email

AI agents adding a new email MUST:

- Answer all seven brand questions (§22.1) before writing any code
- Wrap all HTML in `emailLayout()` — never produce a standalone `<html>` document in an email function
- Use only the component blocks from §22.3 — never introduce new inline-style rules
- Provide a plain-text `text` counterpart for every email (1–3 sentences, no HTML)
- Follow the subject line convention from §22.5
- Match the tone from §22.4 to the email's purpose
- Call send functions with fire-and-forget from services: `.catch(console.error)` — email failure must never throw for the caller
- Log OTP codes with `console.info()` in development

AI agents MUST NOT:

- Write raw `<html>`/`<body>` wrappers inside an email function — only `emailLayout()` does this
- Create a second layout wrapper — there is exactly one `emailLayout()` in the codebase
- Use inline styles not defined in §22.3's component reference
- Include `<style>` blocks or external CSS links (unsupported in most email clients)
- Use a dark background inside the body card — only the `emailLayout` header uses `#0f172a`
- Add emoji outside of celebratory email headings

---

## 23. Final Principle

> **"Validation gates. Controllers coordinate. Services decide. Repositories store. Indexes make it fast. Storage abstracts the cloud. Email informs with one consistent voice. The collection documents it all."**

This sequence is non-negotiable on every request, for every feature, on every project scaffolded from this guide.
