// lib/emailLogPeriods.test.ts — unit tests for the email log's period filter.
// Run with:  npm run test:unit   (Node's built-in test runner; no extra dependency)
import { describe, test } from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_EMAIL_LOG_PERIOD,
  EMAIL_LOG_PERIODS,
  EMAIL_LOG_PERIOD_LABELS,
  describePeriod,
  resolvePeriod,
  type PeriodSelection,
} from "./emailLogPeriods.ts"

const at = (iso: string) => new Date(iso)
const pick = (period: PeriodSelection["period"], customFrom = "", customTo = ""): PeriodSelection => ({ period, customFrom, customTo })

describe("the period list", () => {
  test("offers every period the brief lists, with a label each, defaulting to the last 24 hours", () => {
    assert.deepEqual(
      EMAIL_LOG_PERIODS.map((p) => EMAIL_LOG_PERIOD_LABELS[p]),
      ["Last hour", "Last 24 hours", "Last 7 days", "Last 30 days", "Today", "Yesterday", "All time", "Pick dates"]
    )
    assert.equal(DEFAULT_EMAIL_LOG_PERIOD, "last_24_hours")
  })
})

describe("sliding periods", () => {
  const now = at("2026-11-23T15:30:45.123Z")

  test("are measured back from now, with no upper bound", () => {
    assert.deepEqual(resolvePeriod(pick("last_hour"), now, "UTC"), { from: "2026-11-23T14:30:45.123Z" })
    assert.deepEqual(resolvePeriod(pick("last_24_hours"), now, "UTC"), { from: "2026-11-22T15:30:45.123Z" })
    assert.deepEqual(resolvePeriod(pick("last_7_days"), now, "UTC"), { from: "2026-11-16T15:30:45.123Z" })
    assert.deepEqual(resolvePeriod(pick("last_30_days"), now, "UTC"), { from: "2026-10-24T15:30:45.123Z" })
  })

  test("keep sliding: a later fetch gives a later window", () => {
    const first = resolvePeriod(pick("last_24_hours"), at("2026-11-23T10:00:00Z"), "UTC")
    const later = resolvePeriod(pick("last_24_hours"), at("2026-11-23T10:05:00Z"), "UTC")
    assert.equal(first.from, "2026-11-22T10:00:00.000Z")
    assert.equal(later.from, "2026-11-22T10:05:00.000Z")
  })

  test("do not depend on the time zone — they are lengths of time, not calendar days", () => {
    const zones = ["UTC", "Africa/Lagos", "America/New_York", "Pacific/Auckland", "Asia/Kolkata"]
    const results = zones.map((z) => resolvePeriod(pick("last_7_days"), now, z).from)
    assert.equal(new Set(results).size, 1)
  })
})

describe("all time", () => {
  test("has no bounds at all", () => {
    assert.deepEqual(resolvePeriod(pick("all_time"), at("2026-11-23T15:30:00Z"), "UTC"), {})
  })
})

describe("today and yesterday", () => {
  test("are whole days in UTC", () => {
    const now = at("2026-11-23T15:30:45Z")
    assert.deepEqual(resolvePeriod(pick("today"), now, "UTC"), { from: "2026-11-23T00:00:00.000Z", to: "2026-11-24T00:00:00.000Z" })
    assert.deepEqual(resolvePeriod(pick("yesterday"), now, "UTC"), { from: "2026-11-22T00:00:00.000Z", to: "2026-11-23T00:00:00.000Z" })
  })

  test("yesterday ends exactly where today begins, so the two never overlap or leave a gap", () => {
    const now = at("2026-11-23T15:30:45Z")
    for (const zone of ["UTC", "Africa/Lagos", "America/New_York", "Pacific/Auckland", "Asia/Kolkata"]) {
      assert.equal(resolvePeriod(pick("yesterday"), now, zone).to, resolvePeriod(pick("today"), now, zone).from, zone)
    }
  })

  test("follow the admin's own time zone, not UTC", () => {
    // 23:30 UTC on the 23rd is already 00:30 on the 24th in Lagos (UTC+1).
    const now = at("2026-11-23T23:30:00Z")
    assert.deepEqual(resolvePeriod(pick("today"), now, "Africa/Lagos"), { from: "2026-11-23T23:00:00.000Z", to: "2026-11-24T23:00:00.000Z" })
    // …and still the 23rd in New York (UTC-5 in November).
    assert.deepEqual(resolvePeriod(pick("today"), now, "America/New_York"), { from: "2026-11-23T05:00:00.000Z", to: "2026-11-24T05:00:00.000Z" })
  })

  test("handle a zone with a half-hour offset", () => {
    // 20:00 UTC on the 23rd is 01:30 on the 24th in Kolkata (UTC+5:30).
    assert.deepEqual(resolvePeriod(pick("today"), at("2026-11-23T20:00:00Z"), "Asia/Kolkata"), {
      from: "2026-11-23T18:30:00.000Z",
      to: "2026-11-24T18:30:00.000Z",
    })
  })

  test("handle a zone ahead of UTC by more than half a day", () => {
    // Auckland is UTC+13 in November (daylight time).
    assert.deepEqual(resolvePeriod(pick("today"), at("2026-11-23T12:00:00Z"), "Pacific/Auckland"), {
      from: "2026-11-23T11:00:00.000Z",
      to: "2026-11-24T11:00:00.000Z",
    })
  })

  test("a fall-back day is 25 hours long", () => {
    // New York ends daylight time on 1 Nov 2026; "yesterday" from the 2nd is that day.
    const { from, to } = resolvePeriod(pick("yesterday"), at("2026-11-02T12:00:00Z"), "America/New_York")
    assert.equal(from, "2026-11-01T04:00:00.000Z") // midnight EDT, UTC-4
    assert.equal(to, "2026-11-02T05:00:00.000Z") // midnight EST, UTC-5
    assert.equal((Date.parse(to!) - Date.parse(from!)) / 3_600_000, 25)
  })

  test("a spring-forward day is 23 hours long", () => {
    const { from, to } = resolvePeriod(pick("today"), at("2026-03-08T18:00:00Z"), "America/New_York")
    assert.equal(from, "2026-03-08T05:00:00.000Z") // midnight EST, UTC-5
    assert.equal(to, "2026-03-09T04:00:00.000Z") // midnight EDT, UTC-4
    assert.equal((Date.parse(to!) - Date.parse(from!)) / 3_600_000, 23)
  })

  test("start a day at 01:00 where the clocks skip midnight", () => {
    // Havana springs forward at 00:00 on 8 Mar 2026, so that day has no midnight.
    const { from, to } = resolvePeriod(pick("today"), at("2026-03-08T12:00:00Z"), "America/Havana")
    assert.equal(from, "2026-03-08T05:00:00.000Z") // 01:00 local, the first moment of the 8th
    assert.equal(to, "2026-03-09T04:00:00.000Z")
  })

  test("recompute across midnight: the same selection moves to the new day on the next fetch", () => {
    const before = resolvePeriod(pick("today"), at("2026-11-23T23:59:59Z"), "UTC")
    const after = resolvePeriod(pick("today"), at("2026-11-24T00:00:01Z"), "UTC")
    assert.equal(before.from, "2026-11-23T00:00:00.000Z")
    assert.equal(after.from, "2026-11-24T00:00:00.000Z")
  })
})

describe("a custom range", () => {
  const now = at("2026-11-23T15:30:00Z")

  test("includes the last day: it ends at the start of the day after", () => {
    assert.deepEqual(resolvePeriod(pick("custom", "2026-11-20", "2026-11-22"), now, "UTC"), {
      from: "2026-11-20T00:00:00.000Z",
      to: "2026-11-23T00:00:00.000Z",
    })
  })

  test("the same date twice is that one day", () => {
    assert.deepEqual(resolvePeriod(pick("custom", "2026-11-20", "2026-11-20"), now, "UTC"), {
      from: "2026-11-20T00:00:00.000Z",
      to: "2026-11-21T00:00:00.000Z",
    })
  })

  test("is read in the admin's time zone", () => {
    assert.deepEqual(resolvePeriod(pick("custom", "2026-11-20", "2026-11-20"), now, "Africa/Lagos"), {
      from: "2026-11-19T23:00:00.000Z",
      to: "2026-11-20T23:00:00.000Z",
    })
  })

  test("takes a daylight-saving day at its real length", () => {
    const { from, to } = resolvePeriod(pick("custom", "2026-11-01", "2026-11-01"), now, "America/New_York")
    assert.equal((Date.parse(to!) - Date.parse(from!)) / 3_600_000, 25)
  })

  test("carries across a month and a year end", () => {
    assert.deepEqual(resolvePeriod(pick("custom", "2026-12-30", "2026-12-31"), now, "UTC"), {
      from: "2026-12-30T00:00:00.000Z",
      to: "2027-01-01T00:00:00.000Z",
    })
    assert.equal(resolvePeriod(pick("custom", "2028-02-29", "2028-02-29"), now, "UTC").to, "2028-03-01T00:00:00.000Z")
  })

  test("with only a start date has no upper bound", () => {
    assert.deepEqual(resolvePeriod(pick("custom", "2026-11-20", ""), now, "UTC"), { from: "2026-11-20T00:00:00.000Z" })
  })

  test("with only an end date has no lower bound, and still includes that day", () => {
    assert.deepEqual(resolvePeriod(pick("custom", "", "2026-11-20"), now, "UTC"), { to: "2026-11-21T00:00:00.000Z" })
  })

  test("with no dates picked yet has no bounds", () => {
    assert.deepEqual(resolvePeriod(pick("custom", "", ""), now, "UTC"), {})
  })

  test("is ignored when the dates are reversed", () => {
    assert.deepEqual(resolvePeriod(pick("custom", "2026-11-22", "2026-11-20"), now, "UTC"), {})
  })

  test("ignores a value that is not a real date, and keeps the other end", () => {
    assert.deepEqual(resolvePeriod(pick("custom", "2026-02-31", "2026-11-20"), now, "UTC"), { to: "2026-11-21T00:00:00.000Z" })
    assert.deepEqual(resolvePeriod(pick("custom", "yesterday", ""), now, "UTC"), {})
    assert.deepEqual(resolvePeriod(pick("custom", "20-11-2026", ""), now, "UTC"), {})
  })

  test("does not use the custom dates for any other period", () => {
    assert.deepEqual(resolvePeriod(pick("all_time", "2026-11-20", "2026-11-22"), now, "UTC"), {})
    assert.equal(resolvePeriod(pick("today", "2026-01-01", "2026-01-02"), now, "UTC").from, "2026-11-23T00:00:00.000Z")
  })
})

describe("every window is half-open: the instant at `to` belongs to the NEXT window", () => {
  test("a range ends exactly where the following day begins", () => {
    const now = at("2026-11-23T15:30:00Z")
    for (const zone of ["UTC", "Africa/Lagos", "America/New_York", "Pacific/Auckland"]) {
      const one = resolvePeriod(pick("custom", "2026-11-20", "2026-11-20"), now, zone)
      const next = resolvePeriod(pick("custom", "2026-11-21", "2026-11-21"), now, zone)
      assert.equal(one.to, next.from, zone)
    }
  })
})

describe("describing the period", () => {
  const now = at("2026-11-23T15:30:00Z")

  test("names the sliding periods", () => {
    assert.equal(describePeriod(pick("last_hour"), now, "UTC"), "the last hour")
    assert.equal(describePeriod(pick("last_24_hours"), now, "UTC"), "the last 24 hours")
    assert.equal(describePeriod(pick("last_7_days"), now, "UTC"), "the last 7 days")
    assert.equal(describePeriod(pick("last_30_days"), now, "UTC"), "the last 30 days")
    assert.equal(describePeriod(pick("all_time"), now, "UTC"), "all time")
  })

  test("gives today and yesterday their dates, in the admin's zone", () => {
    assert.equal(describePeriod(pick("today"), now, "UTC"), "today, Mon, 23 Nov 2026")
    assert.equal(describePeriod(pick("yesterday"), now, "UTC"), "yesterday, Sun, 22 Nov 2026")
    // 15:30 UTC is already the 24th in Auckland.
    assert.equal(describePeriod(pick("today"), now, "Pacific/Auckland"), "today, Tue, 24 Nov 2026")
  })

  test("describes a custom range", () => {
    assert.equal(describePeriod(pick("custom", "2026-11-20", "2026-11-22"), now, "UTC"), "20 Nov 2026 to 22 Nov 2026")
    assert.equal(describePeriod(pick("custom", "2026-11-20", "2026-11-20"), now, "UTC"), "Fri, 20 Nov 2026")
    assert.equal(describePeriod(pick("custom", "2026-11-20", ""), now, "UTC"), "from 20 Nov 2026 onwards")
    assert.equal(describePeriod(pick("custom", "", "2026-11-22"), now, "UTC"), "up to and including 22 Nov 2026")
  })

  test("says plainly when a custom range is unusable", () => {
    assert.match(describePeriod(pick("custom", "2026-11-22", "2026-11-20"), now, "UTC"), /wrong|before the start date/)
    assert.match(describePeriod(pick("custom", "", ""), now, "UTC"), /no dates picked/)
  })
})
