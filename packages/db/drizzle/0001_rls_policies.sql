-- ============================================================================
-- Row-Level Security policies — the DB-level tenant/market isolation backstop.
--
-- This file is the SOURCE OF TRUTH; its content is copied verbatim into a
-- drizzle-kit custom migration (drizzle/NNNN_rls_policies.sql) so it lives in
-- the tracked migration history alongside the schema-generated migrations,
-- per the plan's "RLS lives in tracked migrations, not hand-applied via psql"
-- requirement — every Neon preview branch then inherits isolation automatically.
--
-- Two operational requirements this file assumes but does not itself set up
-- (do when Neon connection details are available):
--   1. The app's normal request-serving Postgres role must NOT have BYPASSRLS.
--   2. A SEPARATE Postgres role (e.g. `usapt_service`) WITH BYPASSRLS is needed
--      for the cron-tick process, which must enumerate and process every
--      organization in one run — a plain RLS-scoped connection can only ever
--      see one org at a time (by design). Application request paths (staff
--      app, candidate-facing pages, webhooks resolved to one org) always use
--      the RLS-scoped role via withRequestContext(); only the cron tick uses
--      the service role, and only to (a) list orgs and (b) hand off to
--      withRequestContext() per org for the actual per-org work — the service
--      role itself should still do as little unscoped querying as possible.
-- ============================================================================

CREATE OR REPLACE FUNCTION app_current_org_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_org_id', true), '')::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_has_market_access(target_market_id uuid) RETURNS boolean AS $$
  SELECT
    current_setting('app.market_ids', true) = '*'
    OR (
      target_market_id IS NOT NULL
      AND target_market_id::text = ANY(string_to_array(NULLIF(current_setting('app.market_ids', true), ''), ','))
    )
$$ LANGUAGE sql STABLE;

-- — Tenancy root -------------------------------------------------------------
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organizations USING (id = app_current_org_id());

ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON brands USING (org_id = app_current_org_id());

ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON markets USING (
  EXISTS (SELECT 1 FROM brands b WHERE b.id = markets.brand_id AND b.org_id = app_current_org_id())
);

-- — Auth / access -------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users USING (org_id = app_current_org_id());

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_roles USING (org_id = app_current_org_id());

ALTER TABLE user_market_scopes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_market_scopes USING (
  EXISTS (SELECT 1 FROM user_roles ur WHERE ur.id = user_market_scopes.user_role_id AND ur.org_id = app_current_org_id())
);

ALTER TABLE magic_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON magic_links USING (
  EXISTS (SELECT 1 FROM users u WHERE u.id = magic_links.user_id AND u.org_id = app_current_org_id())
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sessions USING (
  EXISTS (SELECT 1 FROM users u WHERE u.id = sessions.user_id AND u.org_id = app_current_org_id())
);

-- platform_admins: intentionally NOT org-scoped, no RLS — vendor-side accounts.
-- support_access_grants: org-scoped so an org can see grants made against it (transparency).
ALTER TABLE support_access_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON support_access_grants USING (org_id = app_current_org_id());

-- — Integrations --------------------------------------------------------------
ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON integration_configs USING (org_id = app_current_org_id());

ALTER TABLE messages_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON messages_log USING (org_id = app_current_org_id());

-- — Cadence ---------------------------------------------------------------------
ALTER TABLE copy_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON copy_templates USING (org_id = app_current_org_id());

ALTER TABLE cadence_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON cadence_rules USING (org_id = app_current_org_id());

ALTER TABLE cadence_rule_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON cadence_rule_overrides USING (
  EXISTS (SELECT 1 FROM cadence_rules cr WHERE cr.id = cadence_rule_overrides.cadence_rule_id AND cr.org_id = app_current_org_id())
);

ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON job_postings USING (org_id = app_current_org_id());

-- — Candidate identity thread (the most sensitive data in the system) ----------
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON candidates USING (org_id = app_current_org_id());
-- RESTRICTIVE => ANDed with the permissive policy above, not ORed — a market
-- mismatch can never be compensated for by some other permissive policy.
CREATE POLICY market_scope ON candidates AS RESTRICTIVE USING (app_has_market_access(market_id));

ALTER TABLE candidate_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON candidate_status_history USING (
  EXISTS (SELECT 1 FROM candidates c WHERE c.id = candidate_status_history.candidate_id AND c.org_id = app_current_org_id())
);
CREATE POLICY market_scope ON candidate_status_history AS RESTRICTIVE USING (
  EXISTS (SELECT 1 FROM candidates c WHERE c.id = candidate_status_history.candidate_id AND app_has_market_access(c.market_id))
);

-- Ingestion tables carry org_id nullable (unresolved at parse time); rows with a
-- null org_id are only reachable through a platform-admin/triage path outside
-- normal per-org RLS context, which is intentional — an application bug should
-- not accidentally make an un-triaged inbound record visible to a tenant.
ALTER TABLE inbound_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON inbound_emails USING (org_id = app_current_org_id());

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON webhook_events USING (org_id = app_current_org_id());

-- — Interview sessions / attendance -------------------------------------------
-- interview_sessions "may span markets" per the FRD, so no market_scope
-- RESTRICTIVE policy here (org-level only) — the sensitive per-candidate data
-- (bookings, attendance, evaluations) still gets market-scoped below.
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON interview_sessions USING (org_id = app_current_org_id());

ALTER TABLE session_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON session_bookings USING (
  EXISTS (SELECT 1 FROM interview_sessions s WHERE s.id = session_bookings.session_id AND s.org_id = app_current_org_id())
);
CREATE POLICY market_scope ON session_bookings AS RESTRICTIVE USING (
  EXISTS (SELECT 1 FROM candidates c WHERE c.id = session_bookings.candidate_id AND app_has_market_access(c.market_id))
);

ALTER TABLE attendance_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON attendance_events USING (
  EXISTS (
    SELECT 1 FROM session_bookings sb JOIN interview_sessions s ON s.id = sb.session_id
    WHERE sb.id = attendance_events.session_booking_id AND s.org_id = app_current_org_id()
  )
);
CREATE POLICY market_scope ON attendance_events AS RESTRICTIVE USING (
  EXISTS (SELECT 1 FROM candidates c WHERE c.id = attendance_events.candidate_id AND app_has_market_access(c.market_id))
);

-- — Evaluation / decision / offer / referral -----------------------------------
ALTER TABLE scorecard_criteria_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON scorecard_criteria_versions USING (org_id = app_current_org_id());

ALTER TABLE quiz_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON quiz_definitions USING (org_id = app_current_org_id());

ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON evaluations USING (
  EXISTS (SELECT 1 FROM candidates c WHERE c.id = evaluations.candidate_id AND c.org_id = app_current_org_id())
);
CREATE POLICY market_scope ON evaluations AS RESTRICTIVE USING (
  EXISTS (SELECT 1 FROM candidates c WHERE c.id = evaluations.candidate_id AND app_has_market_access(c.market_id))
);
-- NOTE: RLS is row-level only — it does NOT hide the felony_disclosure COLUMN
-- from a permitted row. Column-level protection is a separate, independent
-- mechanism: application code MUST query the evaluations_safe view (excludes
-- felony_disclosure) for every list/kanban/table/export path, and read the
-- base `evaluations` table only via a gated, audit-logged detail endpoint.

ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON decisions USING (
  EXISTS (SELECT 1 FROM candidates c WHERE c.id = decisions.candidate_id AND c.org_id = app_current_org_id())
);
CREATE POLICY market_scope ON decisions AS RESTRICTIVE USING (
  EXISTS (SELECT 1 FROM candidates c WHERE c.id = decisions.candidate_id AND app_has_market_access(c.market_id))
);

ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON offers USING (
  EXISTS (SELECT 1 FROM candidates c WHERE c.id = offers.candidate_id AND c.org_id = app_current_org_id())
);
CREATE POLICY market_scope ON offers AS RESTRICTIVE USING (
  EXISTS (SELECT 1 FROM candidates c WHERE c.id = offers.candidate_id AND app_has_market_access(c.market_id))
);

ALTER TABLE local_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON local_referrals USING (
  EXISTS (
    SELECT 1 FROM markets m JOIN brands b ON b.id = m.brand_id
    WHERE m.id = local_referrals.market_id AND b.org_id = app_current_org_id()
  )
);
CREATE POLICY market_scope ON local_referrals AS RESTRICTIVE USING (app_has_market_access(market_id));

-- — Cohorts ------------------------------------------------------------------
ALTER TABLE class_cohorts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON class_cohorts USING (
  (brand_id IS NOT NULL AND EXISTS (SELECT 1 FROM brands b WHERE b.id = class_cohorts.brand_id AND b.org_id = app_current_org_id()))
  OR (market_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM markets m JOIN brands b ON b.id = m.brand_id
    WHERE m.id = class_cohorts.market_id AND b.org_id = app_current_org_id()
  ))
);

ALTER TABLE cohort_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON cohort_members USING (
  EXISTS (SELECT 1 FROM candidates c WHERE c.id = cohort_members.candidate_id AND c.org_id = app_current_org_id())
);

-- — Cross-cutting --------------------------------------------------------------
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_log USING (org_id = app_current_org_id());

ALTER TABLE threshold_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON threshold_settings USING (org_id = app_current_org_id());

-- scheduled_job_runs: intentionally NOT org-scoped, no RLS — internal cron
-- bookkeeping only ever touched by the BYPASSRLS service role, never by a
-- tenant-scoped request.

-- ============================================================================
-- Candidate state-machine guard: the mechanical enforcement of "status is a
-- side effect of an action, never manually set" (FRD Section 3). Only
-- packages/core's transitionCandidate() may set app.allow_status_transition
-- for the current transaction (see packages/db/src/client.ts's
-- withStatusTransitionAllowed) — any other UPDATE that touches `status` is
-- rejected, including a careless migration, admin script, or future ORM call
-- that bypasses the service layer.
-- ============================================================================
CREATE OR REPLACE FUNCTION candidates_status_transition_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF current_setting('app.allow_status_transition', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'candidates.status may only be changed via transitionCandidate() (packages/core/state-machine)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER status_transition_guard
  BEFORE UPDATE ON candidates
  FOR EACH ROW
  EXECUTE FUNCTION candidates_status_transition_guard();
