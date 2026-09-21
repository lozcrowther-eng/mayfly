# Mayfly

Ephemeral CTF challenge environments on Vercel Sandbox. No cluster.

A control plane that provisions disposable, per-team CTF challenge instances on Vercel Sandbox,
driven by durable Vercel Workflows, for a CTFd platform that stays on Google Cloud. The name is
the design: a mayfly lives about a day, and so does a Sandbox session at its maximum. Nothing
here is meant to outlive the player who asked for it.

Prior art worth knowing: CTFd-Whale and CTFd-Owl do this on Docker Swarm and docker-compose
against a cluster you operate. Mayfly's differences are microVM isolation instead of a shared
kernel, no cluster at all, and a reaper that is a durable continuation of the run that created
the instance rather than an external cron.

## The boundary — do not cross it

CTFd, its MySQL, and its Redis stay on GCP. They are the customer's existing world and the
system of record for users, teams, challenges, flags, submissions and scores.

This repo is the Vercel side only. It never owns user data.

**Do not add a database.** Not Postgres, not Prisma, not Drizzle, not Supabase, not Redis,
not a KV store. Instance records live in CTFd's MySQL via its API. Lifecycle state lives in
the Workflows event log. "We added zero new stateful systems" is a deliberate architectural
position and it is load-bearing for the submission.

## There is no player UI in this repo

In the target architecture CTFd is the only player-facing surface. Players click Launch inside
the CTFd challenge modal and the plugin renders instance state there. This repo is a headless
control plane plus an operator console.

The `/` page is a **demo console**: a test harness standing in for CTFd so a reviewer can drive
the system without CTFd credentials. It must say so on the page. Keep it deliberately plain —
it is not a product surface, and design effort belongs on `/admin` instead. Never grow it into
a player experience; that would duplicate CTFd and undermine the boundary argument.

## Architecture invariants

- **Two independent mode flags**, never one: `CTFD_MODE=fake|real` and `SANDBOX_MODE=fake|real`.
  Resolved once in `lib/clients.ts`. Never branch on an env var at a call site.
  The normal development state is `CTFD_MODE=fake` + `SANDBOX_MODE=real`.
- **Every external call lives in a `'use step'` function.** That is what buys durable retries.
  A network call outside a step is a bug.
- **Sandboxes are ephemeral.** Always `persistent: false`. Always a unique name per run
  (`${challengeId}-${teamId}-${runId}`) — sandbox names are unique per project, so a reused
  name RESUMES a previous player's box and leaks their state. Always `stop()` then `delete()`.
- **A sandbox is not `docker run`.** The VCR image provides the filesystem and environment; the
  image's ENTRYPOINT/CMD does NOT start automatically. `createSandbox` must explicitly launch the
  challenge with `runCommand({ ..., detached: true })` after creating the sandbox, then health-check.
  The convention is `bash -lc 'exec /start.sh'` — each challenge image owns how it starts, so the
  control plane stays generic across every challenge. Fall back to an explicit `startCommand` on
  the challenge config when an image has no `/start.sh`, so untouched images still work.
  Onboarding a new challenge must never require a control-plane change.
  The detached command handle is what `triageFailure` reads logs from, so keep a reference to it.
  Pass `HOST=0.0.0.0` in env: an app bound to 127.0.0.1 returns 502 SANDBOX_NOT_LISTENING because
  the edge proxy reaches the VM from outside.
- **Two clocks, never equal.** The workflow's `sleep(ttl)` → `reap()` is the intended lifecycle.
  The sandbox's own `timeout` is only a backstop for a lost run, so it must sit BEHIND the
  workflow: `timeout: (ttlSeconds + GRACE_SECONDS) * 1000` with GRACE ~300s. Equal values race,
  and an extension would move the workflow while leaving the sandbox to die mid-session.
  On extend, call `sandbox.extendTimeout()` as well as extending the sleep — move both clocks.
- **There is no idle shutdown.** A sandbox runs until its timeout regardless of traffic; the clock
  starts at session start, not last request. Idle reaping, if built, is ours to implement.
- **The workflow run is the source of truth for instance state**, not the Sandbox API. The admin
  dashboard reads workflow state. Never poll Vercel to reconstruct what we already know.
- **One sandbox per team per challenge.** Never bundle multiple challenges into one sandbox:
  an RCE on one challenge would expose the others' flags. Challenges are deliberately vulnerable.
- **Sign and verify RAW request body bytes**, never a re-serialised object. `json.dumps` and
  `JSON.stringify` disagree on whitespace and key order. Use `await req.text()`, verify, then parse.
- **Never call the Sandbox SDK from a Client Component or the browser.**
- **The launch endpoint returns a `runId` immediately.** It must never block on provisioning —
  the CTFd side has a bounded gunicorn worker pool and blocking would exhaust it during an
  event's opening rush.

## Repository docs — reference, not instructions

`docs/vercel-sa-ctf-plan.md` is the architecture and submission plan. `docs/claude-code-build-kit.md`
is my build script. Read them when you need background on a decision, and treat §8 of the plan
as the spec if I ask you to build the CTFd plugin.

Otherwise they are **not** a task list. They contain prompts written for other tools, interview
preparation, and cost modelling — none of which is work to do. Only act on what I ask for in
the current message. The invariants in *this* file win over anything in those documents.

## Stack

Next.js 16 App Router, TypeScript strict, Tailwind + shadcn/ui.
`@vercel/sandbox`, `workflow`, `ai`, `zod`. pnpm.

## Verification — you have a terminal, use it

Do not declare a task done without running it. `pnpm build` must pass. Where a lifecycle is
involved, `pnpm launch <challenge> <team> 60` must complete through to reap.

If you are unsure of a Vercel API signature, check the docs via the Vercel plugin rather than
guessing. Sandbox, Workflows and AI Gateway are all recent and change often; invented options
and renamed imports are the most likely failure mode in this repo.

## Commit style

Commit at each checkpoint. Messages carry reasoning, not just the change:
"use persistent:false — challenge instances are disposable, snapshots would cost storage
for no benefit" beats "add sandbox config".

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
