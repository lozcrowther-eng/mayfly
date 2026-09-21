# Mayfly

Ephemeral CTF challenge environments on Vercel Sandbox. No cluster.

A control plane that provisions disposable, per-team CTF challenge instances on Vercel
Sandbox, driven by durable Vercel Workflows, for a CTFd platform that stays on Google Cloud.
See `CLAUDE.md` for the full architecture, invariants, and the boundary this repo does not
cross.

## Running it

```bash
pnpm install
pnpm dev
```

`CTFD_MODE` and `SANDBOX_MODE` (each `fake` or `real`) select which side talks to the real
service versus an in-memory stand-in — see `lib/clients.ts`.

## The `/` page is a demo console, not a player UI

CTFd is the player-facing surface in the target architecture: players click Launch inside
the CTFd challenge modal, and a CTFd plugin renders instance state there. This repo never
builds that experience — duplicating it here would undermine the boundary the whole
architecture rests on (see `CLAUDE.md`, "There is no player UI in this repo").

`/` stands in for CTFd so a reviewer can drive the control plane — launch, poll, extend,
stop — without CTFd credentials, and so there's a clickable Vercel URL if CTFd isn't wired
up in time. It's deliberately plain: a functional console, not a product surface.
