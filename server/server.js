// server.js — bootstrap: init DB connection, then start the HTTP server.
const http = require("http");
const { createApp } = require("./app");
const { AppDataSource } = require("./infrastructure/database/dataSource");
const { initSocketServer } = require("./infrastructure/realtime/socketServer");
const { env } = require("./config/env");
const { ServiceDeskEscalationService } = require("./modules/serviceDesk/services/serviceDeskEscalation.service");

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

    // IT requests: escalate approvals and fulfilment that run past their
    // service level. Safe on several servers (advisory lock + idempotent).
    ServiceDeskEscalationService.Instance.start();
  } catch (err) {
    console.error("[Startup] Failed to start server:", err);
    process.exit(1);
  }
}

bootstrap();
