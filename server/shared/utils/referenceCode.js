// shared/utils/referenceCode.js
// Human-readable reference codes shown instead of a raw uuid (e.g.
// "BF-20260728-014" for a bug, "FR-20260728-014" for a feature request,
// "TKT-20260728-042" for a feedback ticket). The date is the record's
// creation date, embedded for readability only — the number itself is a
// single global sequence per type (never reset per day), so it alone is
// still enough to look the record back up.

function formatDateStamp(date) {
  const d = date instanceof Date ? date : new Date(date);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function formatReferenceCode(prefix, number, createdAt) {
  return `${prefix}-${formatDateStamp(createdAt)}-${String(number).padStart(3, "0")}`;
}

// Returns the numeric part of a code like "BF-20260728-014" (or the older,
// dateless "BF-014"), or null if it doesn't match the given prefix.
function parseReferenceCode(prefix, code) {
  if (typeof code !== "string") return null;
  const match = code.match(new RegExp(`^${prefix}-(?:\\d{8}-)?(\\d+)$`, "i"));
  return match ? Number(match[1]) : null;
}

module.exports = { formatReferenceCode, parseReferenceCode };
