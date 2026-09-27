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
// Typing/comment rooms are opaque, caller-namespaced keys (e.g.
// "feature-request:<id>", "bug:<id>") — this channel doesn't need to know
// what kind of thread it's scoping, only that both sides agree on the key.
const commentRoom = (roomId) => `comments:${roomId}`;

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
    // Broad "admins-and-up" room — used by targeted broadcasts (e.g. the site
    // banner/announcements audience picker), distinct from "superadmins" above
    // which scopes presence visibility.
    if (actor.role === UserRole.ADMIN || actor.role === UserRole.SUPERADMIN) {
      socket.join("admins");
    }

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

    // ── Typing (scoped to whichever comment room the client joins — a feature
    // request, a bug, etc.) ─────────────────────────────────────────────────
    socket.on("room:join", ({ roomId } = {}) => {
      if (roomId) socket.join(commentRoom(roomId));
    });
    socket.on("room:leave", ({ roomId } = {}) => {
      if (roomId) socket.leave(commentRoom(roomId));
    });

    // userName is client-supplied (cosmetic only) — identity (userId) is already
    // properly bound by the JWT handshake above, so there's nothing to spoof that
    // matters; this just saves a DB lookup on every keystroke.
    socket.on("typing:start", ({ roomId, userName } = {}) => {
      if (!roomId) return;
      socket.to(commentRoom(roomId)).emit("typing:start", {
        roomId,
        userId: actor.id,
        userName: userName || "Someone",
      });
    });
    socket.on("typing:stop", ({ roomId } = {}) => {
      if (!roomId) return;
      socket.to(commentRoom(roomId)).emit("typing:stop", {
        roomId,
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

// Lets other modules (e.g. the site banner service) broadcast to every
// connected client without owning the connection lifecycle themselves.
function getIO() {
  return io;
}

// Broadcast to a named room (e.g. "admins") — used for audience-targeted
// pushes that aren't a simple global emit.
function emitToRoom(room, event, payload) {
  io?.to(room).emit(event, payload);
}

// Broadcast directly to specific users' active connections (all tabs/devices),
// looked up via the same presence map used for online/offline tracking. Users
// with no open socket simply won't get the live push — they'll see the
// correct state on their next fetch instead.
function emitToUsers(userIds, event, payload) {
  if (!io) return;
  for (const userId of userIds) {
    const entry = presence.get(userId);
    if (!entry) continue;
    for (const socketId of entry.sockets) {
      io.to(socketId).emit(event, payload);
    }
  }
}

// Is any super admin currently connected? Used to decide whether a live,
// presence-driven channel (like the support chat) needs to fall back to email.
function hasOnlineSuperAdmin() {
  for (const entry of presence.values()) {
    if (entry.role === UserRole.SUPERADMIN && entry.sockets.size > 0) return true;
  }
  return false;
}

module.exports = { initSocketServer, getIO, emitToRoom, emitToUsers, hasOnlineSuperAdmin };
