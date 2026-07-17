import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySessionCookie, type AuthedUser } from "./session";

export async function getCurrentUser(): Promise<AuthedUser | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  return verifySessionCookie(raw);
}

/** Use at the top of any (staff) page/layout that requires a logged-in user. */
export async function requireUser(): Promise<AuthedUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function hasRole(user: AuthedUser, role: string): boolean {
  return user.roles.includes(role);
}
