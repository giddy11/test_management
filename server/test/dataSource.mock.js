// test/dataSource.mock.js
// Jest replaces the real TypeORM DataSource with this stub (see jest.moduleNameMapper).
// Repositories build their singletons from `AppDataSource.getRepository(...)` at import time;
// with this stub there is NO pg connection during tests. Service specs inject their own mock
// repositories, so the stub repo is never actually exercised — and if a test forgets to inject
// a mock, it fails loudly (calling a method on the stub) instead of silently hitting the DB.
const stubRepo = new Proxy(
  {},
  {
    get() {
      throw new Error(
        "DB access during tests is blocked. Inject a mock repository into the service under test."
      );
    },
  }
);

const AppDataSource = {
  getRepository: () => stubRepo,
  initialize: () => {
    throw new Error("AppDataSource.initialize() must not be called in tests.");
  },
  isInitialized: false,
};

module.exports = { AppDataSource };
