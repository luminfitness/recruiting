/**
 * Pure, client-safe role helpers for the role-first IA. No DB, no service
 * logic — just classification of the `roles: string[]` already resolved by
 * lib/session.ts, used to shape the shell and pick a landing screen per role.
 */

/** Org-wide funnel operators who get the full desktop console. */
export const OPERATOR_ROLES = ["recruiting_lead", "trainer_coordinator"] as const;

export function isOperator(roles: string[]): boolean {
  return roles.some((r) => (OPERATOR_ROLES as readonly string[]).includes(r));
}

export function isAdmin(roles: string[]): boolean {
  return roles.includes("admin");
}

/** Field roles get their own focused, single-purpose mobile queue app. */
export function isFieldOnly(roles: string[]): boolean {
  return !isOperator(roles) && !isAdmin(roles) && roles.some((r) => r === "territory_manager" || r === "local_manager");
}

/**
 * Where a user lands at "/". Operators (and, until the Settings console lands,
 * admins) go to Today; field-only users go straight to their queue.
 */
export function landingPathForRoles(roles: string[]): string {
  if (isOperator(roles)) return "/today";
  if (isAdmin(roles)) return "/settings";
  if (roles.includes("local_manager")) return "/local";
  if (roles.includes("territory_manager")) return "/tm";
  return "/today";
}

/** Human label for a role, longest-title-first for the header identity line. */
export function primaryRoleLabel(roles: string[]): string {
  if (roles.includes("recruiting_lead")) return "Recruiting Lead";
  if (roles.includes("trainer_coordinator")) return "Trainer Coordinator";
  if (roles.includes("admin")) return "Administrator";
  if (roles.includes("local_manager")) return "Local Manager";
  if (roles.includes("territory_manager")) return "Territory Manager";
  return "Staff";
}
