// server.js — bootstrap: init DB connection, then start the HTTP server.
const { createApp } = require("./app");
const { AppDataSource } = require("./infrastructure/database/dataSource");
const { env } = require("./config/env");

async function bootstrap() {
  try {
    await AppDataSource.initialize();
    console.info("[DB] Connected to PostgreSQL");

    const app = createApp();
    app.listen(env.port, () => {
      console.info(`[Server] Listening on http://localhost:${env.port} (${env.nodeEnv})`);
    });
  } catch (err) {
    console.error("[Startup] Failed to start server:", err);
    process.exit(1);
  }
}

bootstrap();
