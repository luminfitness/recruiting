import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Old routes redirect (never 404) as the role-first IA re-homes them.
    // Added incrementally per build-step; see docs/UX_REDESIGN_PLAN.md.
    return [
      { source: "/dashboard", destination: "/today", permanent: false },
      { source: "/postings", destination: "/sourcing", permanent: false },
      { source: "/triage", destination: "/sourcing?tab=intake", permanent: false },
      { source: "/roster", destination: "/interviews", permanent: false },
      { source: "/roster/:id", destination: "/interviews/:id", permanent: false },
      { source: "/cohorts", destination: "/classes", permanent: false },
    ];
  },
};

export default nextConfig;
