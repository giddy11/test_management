// shared/utils/deactivatedUser.js
// Deactivating a user soft-deletes the row, so records can still name them.
// These mark such a name so it doesn't read as an active colleague.

function markDeactivated(name, user) {
  return name && user?.deletedAt ? `${name} (deactivated)` : name;
}

// Spread into a person object whose screen has to act differently for a
// deactivated account, not just label it. Absent for active users.
function deactivatedFlag(user) {
  return user?.deletedAt ? { deactivated: true } : {};
}

module.exports = { markDeactivated, deactivatedFlag };
