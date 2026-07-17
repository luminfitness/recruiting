import tokensJson from "../tokens.json" with { type: "json" };

export const tokens = tokensJson;

/** The five status families the whole product is constrained to (never add a sixth). */
export type StatusFamily = "motion" | "action" | "positive" | "negative" | "risk";

export interface BrandTheme {
  name: string;
  sender: string;
  primary: string;
  ink: string;
  tint: string;
  logoUrl?: string;
}

export const defaultBrandTheme: BrandTheme = {
  name: tokens.brandTheme.default.name,
  sender: tokens.brandTheme.default.sender,
  primary: tokens.brandTheme.default.primary,
  ink: tokens.brandTheme.default.ink,
  tint: tokens.brandTheme.default.tint,
};

export const chartPalette: string[] = tokens.chart;
