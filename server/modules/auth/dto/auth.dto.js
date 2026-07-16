// modules/auth/dto/auth.dto.js
// Maps the User entity to the safe public shape. Never exposes password/internal columns.

function toUserResponse(user) {
  if (!user) return null;
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
    companyName: user.companyName ?? null,
    email: user.email,
    isEmailVerified: user.isEmailVerified ?? false,
    onboardingCompleted: user.onboardingCompleted ?? false,
    role: user.role,
    isOrgOwner: user.isOrgOwner ?? false,
    provider: user.provider,
    organizationId: user.organizationId ?? null,
    clientCompanyId: user.clientCompanyId ?? null,
    isSupportLead: user.isSupportLead ?? false,
    avatarUrl: user.avatarUrl ?? null,
    address: user.address ?? null,
    city: user.city ?? null,
    state: user.state ?? null,
    country: user.country ?? null,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt ?? null,
  };
}

function toAuthResponse(user, tokens) {
  return {
    user: toUserResponse(user),
    tokens,
  };
}

module.exports = { toUserResponse, toAuthResponse };
