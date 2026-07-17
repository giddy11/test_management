// shared/utils/referenceCode.js
// Human-readable reference codes shown instead of a raw uuid (e.g. "BF-014"
// for a bug, "FR-014" for a feature request) — same idea as
// feedback.ticketNumber, but with a type prefix since bugs and feature
// requests each have their own sequence.

function formatReferenceCode(prefix, number) {
  return `${prefix}-${String(number).padStart(3, "0")}`;
}

// Returns the numeric part of a code like "BF-014", or null if it doesn't
// match the given prefix.
function parseReferenceCode(prefix, code) {
  if (typeof code !== "string") return null;
  const match = code.match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
  return match ? Number(match[1]) : null;
}

module.exports = { formatReferenceCode, parseReferenceCode };
