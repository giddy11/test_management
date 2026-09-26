// shared/utils/nameSearch.js
// Narrows a query builder to rows whose joined user matches a typed name. Each
// whitespace-separated word must appear somewhere in "first last", so "philip
// akpan", "akpan philip" and a bare "phil" all find Philip Akpan.
//
// `alias` is the user join's alias. It's quoted because TypeORM quotes camelCase
// aliases ("reportedBy") and Postgres folds an unquoted one to lower case.
function andWhereUserNameMatches(qb, alias, search) {
  search
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .forEach((word, i) => {
      const param = `${alias}Name${i}`;
      qb.andWhere(
        `CONCAT_WS(' ', "${alias}"."first_name", "${alias}"."last_name") ILIKE :${param}`,
        { [param]: `%${word}%` }
      );
    });
}

module.exports = { andWhereUserNameMatches };
