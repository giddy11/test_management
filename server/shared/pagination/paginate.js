// shared/pagination/paginate.js
// Shared offset-pagination helpers. COUNT is only run on page 1 (see buildMeta callers).

function getOffset(page, limit) {
  return (page - 1) * limit;
}

function buildMeta(page, limit, total, resultCount) {
  return {
    page,
    limit,
    total,
    totalPages: total ? Math.ceil(total / limit) : 0,
    hasNext: resultCount === limit,
    hasPrev: page > 1,
  };
}

// For the callers that DO count on every page (the activity log, which has to
// render "Showing 1–50 of N" on page 5 as well as page 1). `total` is exact
// here, so hasNext comes from the total rather than from the "a full page came
// back, there is probably another" guess buildMeta has to make.
function buildMetaFromTotal(page, limit, total) {
  return {
    page,
    limit,
    total,
    totalPages: total ? Math.ceil(total / limit) : 0,
    hasNext: page * limit < total,
    hasPrev: page > 1,
  };
}

module.exports = { getOffset, buildMeta, buildMetaFromTotal };
