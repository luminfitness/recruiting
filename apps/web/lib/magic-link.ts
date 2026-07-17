import { eq, and, gt, isNull } from "drizzle-orm";
import { withRequestContext, getServiceDb } from "@usapt/db";
import { magicLinks, users } from "@usapt/db/schema";
import { generateAuthToken, hashAuthToken, MAGIC_LINK_TTL_MINUTES } from "@usapt/core";
import { getProvider } from "@usapt/core";

/**
 * Looks the email up ACROSS orgs (a user only ever belongs to one org, per
 * the users_org_email_idx unique constraint, but we don't know which org a
 * login attempt is for yet) — this one lookup is the auth flow's own
 * bootstrapping problem, distinct from the session-cookie one solved in
 * lib/session.ts. It deliberately uses the BYPASSRLS service connection
 * (getServiceDb) rather than withRequestContext, since by definition no org
 * is known yet; only a user's id/org/email is read here, never anything
 * candidate/market-scoped, which keeps the exposure minimal.
 */
export async function requestMagicLink(email: string, appBaseUrl: string): Promise<void> {
  const db = getServiceDb();
  const [user] = await db.select().from(users).where(and(eq(users.email, email), isNull(users.deactivatedAt)));
  // Always behave the same whether or not the email matches — don't leak account existence.
  if (!user) return;

  const rawToken = generateAuthToken();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60 * 1000);

  await withRequestContext({ orgId: user.orgId, userId: user.id, marketIds: "*" }, async (tx) => {
    await tx.insert(magicLinks).values({ userId: user.id, tokenHash: hashAuthToken(rawToken), expiresAt });
    const provider = await getProvider(tx, user.orgId, "messaging_email");
    await provider.sendEmail({
      to: user.email,
      fromName: "USAPT Recruiting Platform",
      fromEmail: "no-reply@usapt-platform.example",
      subject: "Your sign-in link",
      body: `Sign in: ${appBaseUrl}/auth/verify/${rawToken}?org=${user.orgId}\n\nThis link expires in ${MAGIC_LINK_TTL_MINUTES} minutes.`,
      templateKey: "magic_link",
    });
  });
}

export async function consumeMagicLink(orgId: string, rawToken: string): Promise<{ userId: string } | null> {
  const tokenHash = hashAuthToken(rawToken);
  return withRequestContext({ orgId, marketIds: "*" }, async (tx) => {
    const [row] = await tx
      .select()
      .from(magicLinks)
      .innerJoin(users, eq(users.id, magicLinks.userId))
      .where(and(eq(magicLinks.tokenHash, tokenHash), gt(magicLinks.expiresAt, new Date()), isNull(magicLinks.consumedAt)));
    if (!row) return null;

    await tx.update(magicLinks).set({ consumedAt: new Date() }).where(eq(magicLinks.tokenHash, tokenHash));
    return { userId: row.users.id };
  });
}
