-- Per-brand, per-role posting package (scheduling link + contact number).
-- Previously these were hardcoded constants in lib/cadence.ts.
CREATE TABLE IF NOT EXISTS "brand_role_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE cascade,
  "role_type" "role_type" NOT NULL,
  "contact_number" text,
  "scheduling_link" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- One package per (brand, role): this is what keeps the role-correct pairing
-- unambiguous, so a lookup keyed on role_type can only ever return one answer.
CREATE UNIQUE INDEX IF NOT EXISTS "brand_role_settings_brand_role_idx"
  ON "brand_role_settings" ("brand_id", "role_type");

ALTER TABLE "brand_role_settings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "brand_role_settings";
CREATE POLICY tenant_isolation ON "brand_role_settings" USING (org_id = app_current_org_id());
