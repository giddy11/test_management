// modules/access/dto/access.dto.js
// Response shapes for the Roles & access UI.

function toRoleResponse(role) {
  return {
    id: role.id,
    key: role.key ?? null,
    name: role.name,
    description: role.description ?? null,
    isBuiltin: !!role.isBuiltin,
    isLocked: !!role.isLocked,
    permissions: role.permissions ?? [],
    // Shown as "N permissions · M members" in the role list, so an admin can
    // see the impact of an edit before making it.
    permissionCount: role.permissionCount ?? (role.permissions?.length ?? 0),
    memberCount: role.memberCount ?? 0,
  };
}

function toPermissionResponse(p) {
  return {
    code: p.code,
    category: p.category,
    label: p.label,
    description: p.description ?? null,
    warning: p.warning ?? null,
  };
}

function toCategoryResponse(c) {
  return {
    key: c.key,
    label: c.label,
    description: c.description ?? null,
  };
}

function toCatalogResponse({ categories, permissions }) {
  return {
    categories: categories.map(toCategoryResponse),
    permissions: permissions.map(toPermissionResponse),
  };
}

module.exports = {
  toRoleResponse,
  toPermissionResponse,
  toCategoryResponse,
  toCatalogResponse,
};
