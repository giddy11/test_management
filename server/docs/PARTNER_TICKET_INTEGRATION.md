# Partner Ticket Integration Guide

This is the handoff doc for integrating **your own product** with TestMate's ticketing
system: your users raise bugs, feature requests, and complaints **without ever leaving
your platform** — no redirect to a TestMate-hosted page. You build the form UI; these
APIs are what it calls.

There are three steps, done once (step 1) and then repeatedly (steps 2–3):

1. **Provision your company** in TestMate — one-time setup, done server-to-server.
2. **Submit tickets** from your own form — called every time a user raises one.
3. **List your tickets** — called by your own dashboard to show what's been raised.

Every response — success or error — uses the same envelope:

```json
{
  "success": true,
  "message": "Human-readable summary",
  "statusCode": 200,
  "data": { /* endpoint-specific, see below */ },
  "errors": []
}
```

Validation failures populate `errors` with `{ field, message }` entries, one per invalid
field.

---

## Step 1 — Provision your company

Call this **once** when your customer/company first needs a TestMate ticket form (e.g.
the moment they sign up on your side). It creates the client company record **and** its
first IT support account together.

```
POST /api/v1/integrations/companies
Content-Type: application/json
```

**Auth:** none. This endpoint takes no API key — the request identifies its target
project directly with `projectId`. Get the `projectId` from a TestMate admin: it's shown
in the small "Project ID" row under the project name at the top of the project page.

**Rate limit:** 20 requests / 60 seconds.

### Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `projectId` | string (uuid) | yes | Which TestMate project to provision into |
| `name` | string | yes | 1–200 characters |
| `contactEmail` | string | no | Must be unique across every client company in TestMate |
| `supporter.firstName` | string | yes | 1–100 characters |
| `supporter.lastName` | string | yes | 1–100 characters |
| `supporter.email` | string | yes | Becomes the company's first IT support login. **No password field** — TestMate generates one and emails it to this address via the standard invite |

```json
{
  "projectId": "<project id>",
  "name": "Acme Corp",
  "contactEmail": "billing@acme.com",
  "supporter": {
    "firstName": "Jamie",
    "lastName": "Ops",
    "email": "jamie@acme.com"
  }
}
```

### Response — `201 Created`

```json
{
  "success": true,
  "message": "Client company provisioned",
  "statusCode": 201,
  "data": {
    "company": {
      "id": "b1c2d3e4-6f7a-4b2c-9d1e-0a1b2c3d4e5f",
      "projectId": "a1a2a3a4-b5b6-47c8-9d0e-1f2a3b4c5d6e",
      "name": "Acme Corp",
      "contactEmail": "billing@acme.com",
      "feedbackToken": "ae4bc9af-7baa-4890-927c-28af7df9ce00",
      "feedbackUrl": "https://<your-domain>/feedback/ae4bc9af-7baa-4890-927c-28af7df9ce00",
      "autoAssignEnabled": false,
      "supporterCount": 0,
      "createdAt": "2026-08-29T12:34:56.789Z"
    }
  },
  "errors": []
}
```

> ### ⚠️ Save `feedbackToken` immediately
> This is the credential every request in **Steps 2 and 3** needs. It is only ever
> handed to you in this response. Persist it to your own database in the same
> transaction you create your customer record — don't rely on being able to fetch it
> back later without help.

### Error responses

| Status | `message` | When |
|---|---|---|
| 404 | `Project not found` | Bad or deleted `projectId` |
| 409 | `A client company with this contact email already exists` | `contactEmail` already belongs to another company. **If that company is under the same `projectId` you sent**, `data.company` is that existing company (full shape above) — recover its `feedbackUrl` from there instead of treating this as a dead end. Different project → `data` is `null` |
| 409 | `This email already belongs to a user account` | `contactEmail` matches an existing TestMate user. Same same-project recovery rule as above |
| 409 | `An account with this email already exists` | `supporter.email` already belongs to a TestMate user. Same same-project recovery rule as above |
| 422 | `Validation failed` | A field is missing/malformed — see `errors` |
| 429 | `Too many requests — please slow down` | More than 20 calls/minute |
| 500 | `Internal server error` | Unexpected failure. If the supporter account failed to create, the half-made company is rolled back — a retry is safe |

**Security notes:**
- No credential check — anyone who knows (or guesses) a `projectId` can create companies
  in it. Treat this call as sensitive; only ever make it from your own backend, never
  from frontend JavaScript or a mobile app bundle.
- No idempotency key. A same-email retry after an uncertain response (e.g. a timeout)
  still comes back as a `409` — but if it targets the same `projectId`, that response's
  `data.company` is the company that was actually created, so you can recover safely.
  Only a cross-project conflict leaves you with no way to tell whether the original call
  succeeded.

### Backfilling customers who signed up before you integrated

There's no separate "existing account" endpoint — TestMate has no notion of when a
customer signed up on *your* side, so the same call above is also how you provision
customers who already existed before you wired this up. Run it as a one-time backfill
(or lazily, e.g. the first time such a customer opens their ticket form) instead of only
from your live signup flow:

1. Loop over your customers that don't yet have a `feedbackToken` saved.
2. Call `POST /api/v1/integrations/companies` for each, same as Step 1.
3. Persist the returned `feedbackToken` exactly as you would for a new signup.
4. If a customer was already provisioned by an earlier partial run (or by a TestMate
   admin manually), you'll get the documented `409` with `data.company` populated —
   treat that as success and just read the token off it, not as a failure.

---

## Step 2 — Submit a ticket (your own form)

This is what your custom-built "Raise a ticket" form calls. It's the **same endpoint**
that powers TestMate's own hosted `/feedback/<token>` page — you're just rendering the
fields yourself instead of sending users to that page.

```
POST /api/v1/public/feedback/<feedbackToken>
Content-Type: multipart/form-data
```

Multipart is required so optional screenshots can ride along with the other fields in
one request.

**Auth:** none — the token is the credential. **Rate limit:** 20 submissions / hour, per
submitting IP.

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | One of `feature_request`, `bug`, `complaint` |
| `title` | string | yes | 1–200 characters |
| `description` | string | yes | 1–5000 characters |
| `suiteName` | string | no | Free text, not validated against anything — pick your own categories, or omit it entirely |
| `submitterName` | string | yes | 1–120 characters |
| `submitterEmail` | string | yes | Where lifecycle updates and the "My tickets" lookup code are sent |
| `submitterPhone` | string | no | E.164 format, e.g. `+2348012345678` |
| `images` | file[] | no | **The actual image file bytes** (multipart), not a URL — up to 5 files, PNG/JPEG/WebP only, 5 MB each. Repeat the `images` field once per file. If your users' screenshots start out hosted elsewhere, fetch the bytes and attach them here; you can't just pass a link. TestMate uploads them to its own storage and hands back a URL in the [ticket list](#step-3--list-your-tickets-dashboard) response |

```bash
curl -X POST https://<your-domain>/api/v1/public/feedback/ae4bc9af-7baa-4890-927c-28af7df9ce00 \
  -F "type=complaint" \
  -F "title=Invoice totals look wrong" \
  -F "description=The tax line doesn't match what's on the PDF export." \
  -F "submitterName=Jamie Ops" \
  -F "submitterEmail=jamie@acme.com" \
  -F "submitterPhone=+2348012345678" \
  -F "images=@screenshot-1.png"
```

### Response — `201 Created`

```json
{
  "success": true,
  "message": "Thanks! Your feedback has been logged.",
  "statusCode": 201,
  "data": { "id": "e3f4a5b6-7c8d-4e9f-a0b1-c2d3e4f5a6b7" },
  "errors": []
}
```

That's the ticket's internal `id`, not a human-readable reference code (e.g.
`TKT-20260915-007`) — TestMate's own hosted form doesn't show that either. It just
confirms submission; the reference code goes out in the confirmation email, and shows up
in the [ticket list](#step-3--list-your-tickets-dashboard) response below.

### Error responses

| Status | `message` | When |
|---|---|---|
| 404 | `This feedback form is not available` | The token is wrong, or the form link was disabled |
| 422 | `Validation failed` | A field is missing/too long/malformed, or an image was rejected (wrong type or over 5 MB) |
| 429 | `Too many submissions — please try again later` | More than 20 submissions from the same IP in an hour |
| 500 | `Internal server error` | Unexpected failure |

### CORS

Unlike the rest of TestMate's API, everything under `/api/v1/public/feedback/*`
(including step 3 below) sends permissive CORS headers — call it **directly from your
own frontend's JavaScript**, on whatever domain your product runs on. No backend proxy
required. This is safe because the token is already meant to be shared in a plain URL,
these routes never use cookies, and every write is separately rate-limited.

> There's also a `GET /api/v1/public/feedback/<feedbackToken>` on the same token, which
> returns the project's test suites — only useful if you want `suiteName` to mirror
> TestMate's actual suite list instead of your own categories. Not needed for a normal
> integration; see the full docs page in the app if you want it.

---

## Step 3 — List your tickets (dashboard)

For your own dashboard/portal to show everything your users have raised — same token as
step 2, no separate login needed.

```
GET /api/v1/public/feedback/<feedbackToken>/tickets
```

**Auth:** none — the token is the credential. **Rate limit:** 60 requests / 15 minutes,
per requesting IP.

### Query parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | integer | `1` | 1-indexed |
| `limit` | integer | `20` | Max `100` |
| `type` | string | — | Optional filter: `feature_request`, `bug`, or `complaint` |

```bash
curl "https://<your-domain>/api/v1/public/feedback/ae4bc9af-7baa-4890-927c-28af7df9ce00/tickets?page=1&limit=20"
```

### Response — `200 OK`

```json
{
  "success": true,
  "message": "Tickets fetched",
  "statusCode": 200,
  "data": [
    {
      "id": "e3f4a5b6-7c8d-4e9f-a0b1-c2d3e4f5a6b7",
      "ticketCode": "TKT-20260915-007",
      "type": "complaint",
      "title": "Invoice totals look wrong",
      "description": "The tax line doesn't match what's on the PDF export.",
      "suiteName": null,
      "submitterName": "Jamie Ops",
      "submitterEmail": "jamie@acme.com",
      "submitterPhone": "+2348012345678",
      "status": "in_progress",
      "attachments": [
        { "id": "att-1", "url": "https://res.cloudinary.com/.../screenshot-1.png" }
      ],
      "rating": null,
      "createdAt": "2026-09-15T09:12:00.000Z",
      "updatedAt": "2026-09-15T10:00:00.000Z"
    }
  ],
  "errors": [],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

### Field notes

| Field | Notes |
|---|---|
| `status` | Collapsed to three values: `received`, `in_progress`, `resolved`. TestMate's internal triage stages (acknowledged/assigned/investigating/escalated/etc.) are deliberately hidden — same simplified view your end users get on TestMate's own "My tickets" page |
| `id` | Internal row id — not the same as `ticketCode` |
| `attachments` | Screenshots submitted with the ticket, if any |

### Error responses

| Status | `message` | When |
|---|---|---|
| 404 | `This feedback form is not available` | The token is wrong, or the form link was disabled |
| 422 | `Validation failed` | Bad `page`/`limit`/`type` |
| 429 | `Too many requests — please try again shortly` | More than 60 requests from the same IP in 15 minutes |
| 500 | `Internal server error` | Unexpected failure |

> **Note:** this endpoint means `feedbackToken` now grants **read** access to every
> ticket raised against it — names, emails, phone numbers, and descriptions — not just
> write access to create new ones. Treat it accordingly: don't log it anywhere a
> browser extension or third-party script could scrape it from, and if it ever leaks,
> have a TestMate admin rotate it via `POST /api/v1/client-companies/:id/link` with
> `{ "enabled": true }` — note that this generates a brand-new token and permanently
> invalidates the old one, so only use it for an actual leak, not to "recover" a token
> you simply forgot to save.

---

## Quick reference

| Step | Endpoint | Auth | Rate limit |
|---|---|---|---|
| 1. Provision company | `POST /api/v1/integrations/companies` | None (`projectId` only) | 20/minute |
| 2. Submit ticket | `POST /api/v1/public/feedback/:token` | None (token) | 20/hour per IP |
| 3. List tickets | `GET /api/v1/public/feedback/:token/tickets` | None (token) | 60/15min per IP |
