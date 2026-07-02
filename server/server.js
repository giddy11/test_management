// server.js — bootstrap: init DB connection, then start the HTTP server.
const http = require("http");
const { createApp } = require("./app");
const { AppDataSource } = require("./infrastructure/database/dataSource");
const { initSocketServer } = require("./infrastructure/realtime/socketServer");
const { env } = require("./config/env");

async function bootstrap() {
  try {
    await AppDataSource.initialize();
    console.info("[DB] Connected to PostgreSQL");

    const app = createApp();
    const httpServer = http.createServer(app); // Socket.IO needs the raw HTTP server, not just Express.
    initSocketServer(httpServer);

    httpServer.listen(env.port, () => {
      console.info(`[Server] Listening on http://localhost:${env.port} (${env.nodeEnv})`);
    });
  } catch (err) {
    console.error("[Startup] Failed to start server:", err);
    process.exit(1);
  }
}

bootstrap();
