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

module.exports = { getOffset, buildMeta };
