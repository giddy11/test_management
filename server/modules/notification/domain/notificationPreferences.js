// modules/notification/domain/notificationPreferences.js
// Per-user opt-outs for in-app and email notifications, grouped by app area.
// Stored on users.notification_preferences as { [category]: { inApp?, email? } };
// a missing category or channel means "on", so new categories default on
// without a migration. Account and security emails (verification, password
// reset, invitations, welcome) are not covered and always go out.

const NotificationCategory = Object.freeze({
  TESTING: "testing",
  PROJECTS: "projects",
  BUGS: "bugs",
  FEATURE_REQUESTS: "featureRequests",
  FEEDBACK: "feedback",
  MENTIONS: "mentions",
  SUPPORT_QUEUE: "supportQueue",
  SERVICE_DESK_APPROVALS: "serviceDeskApprovals",
  SERVICE_DESK_UPDATES: "serviceDeskUpdates",
  SERVICE_DESK_QUEUE: "serviceDeskQueue",
  SUPPORT_CHAT: "supportChat",
  LIVE_CHAT: "liveChat",
});

const NotificationChannel = Object.freeze({
  IN_APP: "inApp",
  EMAIL: "email",
});

const CATEGORIES = Object.freeze(Object.values(NotificationCategory));
const CHANNELS = Object.freeze(Object.values(NotificationChannel));

// prefs: a user's stored notification_preferences (or null/undefined).
function wants(prefs, category, channel) {
  return prefs?.[category]?.[channel] !== false;
}

// Keeps only known categories/channels with boolean values, and stores only
// the opt-outs, so the column never grows with redundant "true"s.
function mergePreferences(current, patch) {
  const next = {};
  for (const category of CATEGORIES) {
    const merged = { ...(current?.[category] ?? {}), ...(patch?.[category] ?? {}) };
    const off = {};
    for (const channel of CHANNELS) {
      if (merged[channel] === false) off[channel] = false;
    }
    if (Object.keys(off).length) next[category] = off;
  }
  return next;
}

module.exports = {
  NotificationCategory,
  NotificationChannel,
  CATEGORIES,
  CHANNELS,
  wants,
  mergePreferences,
};
