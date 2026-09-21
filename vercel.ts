import type { VercelConfig } from "@vercel/config/v1";

// This repo's .vercel/project.json was linked before Next.js was scaffolded in, so the
// project's dashboard framework preset locked in as "Other" — which serves from a generic
// static/public output instead of the Next.js build, 404ing every route despite a clean
// `next build`. Declaring it here fixes detection without touching dashboard settings.
export const config: VercelConfig = {
  framework: "nextjs",
};
