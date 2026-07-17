-- Custom SQL migration file, put your code below! --

-- RLS for the Phase 7 candidate-scoped tables, mirroring candidate_status_history:
-- org tenant isolation (permissive) + market scope (restrictive, ANDed).
ALTER TABLE interview_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON interview_reminders USING (
  EXISTS (SELECT 1 FROM candidates c WHERE c.id = interview_reminders.candidate_id AND c.org_id = app_current_org_id())
);
CREATE POLICY market_scope ON interview_reminders AS RESTRICTIVE USING (
  EXISTS (SELECT 1 FROM candidates c WHERE c.id = interview_reminders.candidate_id AND app_has_market_access(c.market_id))
);

ALTER TABLE tm_outreach ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tm_outreach USING (
  EXISTS (SELECT 1 FROM candidates c WHERE c.id = tm_outreach.candidate_id AND c.org_id = app_current_org_id())
);
CREATE POLICY market_scope ON tm_outreach AS RESTRICTIVE USING (
  EXISTS (SELECT 1 FROM candidates c WHERE c.id = tm_outreach.candidate_id AND app_has_market_access(c.market_id))
);