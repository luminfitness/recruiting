import type { CSSProperties, ReactNode } from "react";
import type { BrandTheme } from "./tokens";
import { defaultBrandTheme } from "./tokens";

/**
 * Wraps ONLY the (candidate) route tree (booking, quiz/intake, confirmations,
 * offers — every candidate-facing surface, per FRD Section 12's brand-theming
 * requirement). Overrides the --brand-primary/--brand-ink/--brand-tint CSS
 * variables from tokens.css with the Brand row's own theme_config. The staff
 * app never renders inside this provider and never re-themes.
 */
export function BrandThemeProvider({ theme, children }: { theme?: Partial<BrandTheme>; children: ReactNode }) {
  const resolved = { ...defaultBrandTheme, ...theme };
  const style: CSSProperties & Record<string, string> = {
    "--brand-primary": resolved.primary,
    "--brand-ink": resolved.ink,
    "--brand-tint": resolved.tint,
  };
  return (
    <div data-brand-theme style={style}>
      {children}
    </div>
  );
}
