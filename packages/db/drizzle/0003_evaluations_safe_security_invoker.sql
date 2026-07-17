-- Custom SQL migration file, put your code below! --

-- Enforce RLS against the QUERYING role, not the view owner. Without this,
-- Postgres 15+ runs the view with the owner's privileges (security_invoker off
-- by default) — and since the owner is a superuser that bypasses RLS, querying
-- evaluations_safe as the app role would leak other orgs'/markets' rows. With
-- security_invoker on, the underlying evaluations RLS policies are checked
-- against the app role, exactly like a direct table query. This is the
-- companion control to "the view hides the felony_disclosure column."
ALTER VIEW "evaluations_safe" SET (security_invoker = true);