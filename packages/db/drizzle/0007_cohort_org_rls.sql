-- Custom SQL migration file, put your code below! --

-- class_cohorts now carries org_id, so scope it directly by org (the old
-- brand/market-EXISTS policy failed for cohorts with both brand_id and
-- market_id null).
DROP POLICY IF EXISTS tenant_isolation ON class_cohorts;
CREATE POLICY tenant_isolation ON class_cohorts USING (org_id = app_current_org_id());