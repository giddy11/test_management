// shared/utils/dateRange.js
// "From / to" filtering on a list's creation date. Dates are YYYY-MM-DD and both
// ends are inclusive of the whole day — same convention as the SLA reports.
const { z } = require("zod");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Not a real date");

// A list's `query` schema: the given fields plus optional from/to, rejecting a
// range that ends before it starts.
function dateRangeQuery(shape) {
  return z
    .object({ ...shape, from: isoDate.optional(), to: isoDate.optional() })
    .refine((q) => !q.from || !q.to || q.from <= q.to, {
      message: "'from' must be on or before 'to'",
      path: ["from"],
    });
}

// Narrows a query builder to rows whose `column` (a timestamptz) falls on or
// between the two days. Either end may be omitted.
function andWhereDateRange(qb, column, { from, to }) {
  if (from) qb.andWhere(`${column} >= CAST(:dateFrom AS date)`, { dateFrom: from });
  if (to) qb.andWhere(`${column} < CAST(:dateTo AS date) + interval '1 day'`, { dateTo: to });
}

module.exports = { dateRangeQuery, andWhereDateRange };
