// infrastructure/realtime/socketServer.js
// A second, purpose-built realtime channel for ephemeral, connection-oriented
// signals (typing, online presence) — separate from Firestore, which stays the
// system of record for actual comment persistence. See ai_agent_flow_firebase.md
// for why comments and this channel are deliberately not the same system.
const { Server } = require("socket.io");
const { verifyAccessToken } = require("../../shared/utils/jwt");
const { env } = require("../../config/env");
const { UserRole } = require("../../config/constants");
const { UserRepository } = require("../../modules/user/repositories/user.repository");

let io = null;

// userId -> { organizationId, role, sockets: Set<socketId> } — tracks how many open
// connections each user has (multiple tabs/devices) plus enough identity to scope
// broadcasts without a DB round-trip per event.
const presence = new Map();

const orgRoom = (organizationId) => `org:${organizationId}`;
const featureRequestRoom = (featureRequestId) => `feature-request:${featureRequestId}`;

// Rooms that should be told about a presence change for `entry` — its own org
// (so org-mates see it) plus superadmins (who see every org, same as
// ProjectService.assertAccess's access model). Never the platform at large —
// that would leak "org B has active users" to org A, the one thing this presence
// feature must not do.
function broadcastRoomsFor(entry) {
  const rooms = ["superadmins"];
  if (entry.organizationId) rooms.push(orgRoom(entry.organizationId));
  return rooms;
}

function isVisibleTo(entry, viewerActor) {
  if (viewerActor.role === UserRole.SUPERADMIN) return true;
  return Boolean(entry.organizationId) && entry.organizationId === viewerActor.organizationId;
}

function initSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigins.length ? env.corsOrigins : true,
      credentials: true,
    },
  });

  // Auth handshake — same access token already used for REST, verified the same way.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) throw new Error("Missing token");
      socket.actor = verifyAccessToken(token); // { id, email, role, organizationId }
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const actor = socket.actor;

    if (actor.organizationId) socket.join(orgRoom(actor.organizationId));
    if (actor.role === UserRole.SUPERADMIN) socket.join("superadmins");

    let entry = presence.get(actor.id);
    if (!entry) {
      entry = { organizationId: actor.organizationId, role: actor.role, sockets: new Set() };
      presence.set(actor.id, entry);
    }
    const wasOffline = entry.sockets.size === 0;
    entry.sockets.add(socket.id);

    if (wasOffline) {
      io.to(broadcastRoomsFor(entry)).emit("presence:online", { userId: actor.id });
    }

    // Snapshot — everyone currently online and visible to this actor's scope.
    const onlineUserIds = [];
    for (const [userId, e] of presence.entries()) {
      if (e.sockets.size > 0 && isVisibleTo(e, actor)) onlineUserIds.push(userId);
    }
    socket.emit("presence:snapshot", { userIds: onlineUserIds });

    // ── Typing (scoped to whichever feature-request room the client joins) ──────
    socket.on("room:join", ({ featureRequestId } = {}) => {
      if (featureRequestId) socket.join(featureRequestRoom(featureRequestId));
    });
    socket.on("room:leave", ({ featureRequestId } = {}) => {
      if (featureRequestId) socket.leave(featureRequestRoom(featureRequestId));
    });

    // userName is client-supplied (cosmetic only) — identity (userId) is already
    // properly bound by the JWT handshake above, so there's nothing to spoof that
    // matters; this just saves a DB lookup on every keystroke.
    socket.on("typing:start", ({ featureRequestId, userName } = {}) => {
      if (!featureRequestId) return;
      socket.to(featureRequestRoom(featureRequestId)).emit("typing:start", {
        featureRequestId,
        userId: actor.id,
        userName: userName || "Someone",
      });
    });
    socket.on("typing:stop", ({ featureRequestId } = {}) => {
      if (!featureRequestId) return;
      socket.to(featureRequestRoom(featureRequestId)).emit("typing:stop", {
        featureRequestId,
        userId: actor.id,
      });
    });

    socket.on("disconnect", () => {
      entry.sockets.delete(socket.id);
      if (entry.sockets.size === 0) {
        io.to(broadcastRoomsFor(entry)).emit("presence:offline", { userId: actor.id });
        UserRepository.Instance.touchLastSeen(actor.id).catch((e) =>
          console.error("[presence] last-seen update failed:", e.message)
        );
      }
    });
  });

  return io;
}

module.exports = { initSocketServer };
