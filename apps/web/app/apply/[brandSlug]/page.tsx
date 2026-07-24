import { notFound } from "next/navigation";
import { BrandThemeProvider } from "@usapt/design-tokens";
import { getPublicBrand, normalizeRole, normalizeSource } from "@/lib/public-apply";
import { ApplyForm } from "./ApplyForm";

/** Public and unauthenticated — never prerender, and never index a stale brand. */
export const dynamic = "force-dynamic";

const ROLE_LABEL = { manager: "Assistant Fitness Manager", trainer: "Certified Personal Trainer" } as const;

export default async function ApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { brandSlug } = await params;
  const sp = await searchParams;

  const brand = await getPublicBrand(brandSlug);
  if (!brand) notFound();

  const roleType = normalizeRole(sp.role);
  const roleLabel = ROLE_LABEL[roleType];
  const source = normalizeSource(sp.src);

  return (
    <BrandThemeProvider theme={brand.theme}>
      <div style={{ minHeight: "100vh", background: "var(--usapt-bg)", color: "var(--usapt-ink)", padding: "28px 20px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: 460, maxWidth: "100%" }}>
          <div
            style={{
              background: "var(--brand-primary)",
              color: "#fff",
              padding: "22px 24px",
              borderRadius: "var(--usapt-radius-lg) var(--usapt-radius-lg) 0 0",
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.85 }}>
              {brand.name}
            </div>
            <h1 style={{ fontSize: 24, margin: "6px 0 0", lineHeight: 1.2 }}>{roleLabel}</h1>
          </div>

          <div
            style={{
              background: "var(--usapt-surface-raised)",
              border: "1px solid var(--usapt-border)",
              borderTop: 0,
              borderRadius: "0 0 var(--usapt-radius-lg) var(--usapt-radius-lg)",
              padding: "22px 24px 26px",
            }}
          >
            <p style={{ fontSize: 14, color: "var(--usapt-text-muted)", lineHeight: 1.5, margin: "0 0 18px" }}>
              Apply below and we&rsquo;ll email you a link to book your group interview — no account needed, and it
              takes about a minute.
            </p>

            {brand.markets.length === 0 ? (
              <p style={{ fontSize: 14, color: "var(--usapt-text-muted)" }}>
                We&rsquo;re not accepting applications for this brand right now.
              </p>
            ) : (
              <ApplyForm
                brandSlug={brand.slug}
                roleType={roleType}
                roleLabel={roleLabel}
                source={source}
                markets={brand.markets}
              />
            )}
          </div>

          <div style={{ textAlign: "center", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-text-faint)", marginTop: 18 }}>
            Recruiting powered by USA PT
          </div>
        </div>
      </div>
    </BrandThemeProvider>
  );
}
