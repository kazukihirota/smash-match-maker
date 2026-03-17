# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `pnpm dev`
- **Build:** `pnpm build` (runs `tsc -b && vite build`)
- **Lint:** `pnpm lint`
- **Preview production build:** `pnpm preview`

## Tech Stack

- **Framework:** React 19 + TypeScript 5.9
- **Build tool:** Vite 7
- **Styling:** Tailwind CSS v4 (via `@tailwindcss/postcss` + Autoprefixer)
- **Routing:** React Router DOM 7
- **Backend:** Supabase (Postgres + Realtime subscriptions)
- **Notifications:** Sonner (toast library)
- **Deployment:** Vercel (SPA mode with catch-all rewrite)
- **Package manager:** pnpm

## Architecture

Single-page React + TypeScript app with Supabase as the backend. Styled with Tailwind CSS v4 utility classes. Dark theme throughout (neutral-900 background, amber-500 accent). Mobile-first design (`max-w-md` container, viewport locked, tap highlight disabled).

### Source Files (`src/`)

| File | Purpose |
|------|---------|
| `main.tsx` | Entry point, renders `<App />` to DOM |
| `App.tsx` | Router setup + Home page (room creation/listing) |
| `Room.tsx` | Main game room — match generation, player management, realtime sync (~870 lines) |
| `Scoreboard.tsx` | Global ELO rankings with monthly/all-time tabs and head-to-head stats |
| `Stats.tsx` | Per-player win statistics and character combo breakdowns |
| `Admin.tsx` | Password-protected admin panel (player rename/delete, match editing, data cleanup) |
| `RecentRooms.tsx` | Browse recent game rooms |
| `types.ts` | Shared TypeScript interfaces (`Match`, `Character`, `Room`, etc.) |
| `elo.ts` | ELO rating calculation (K=32, initial=1000) |
| `supabase.ts` | Supabase client initialization |
| `index.css` | Tailwind imports and global styles |

### Database (Supabase)

Tables: `characters`, `rooms`, `matches`, `player_defaults`, `player_scores`, `admin_config`. All tables have Row Level Security (RLS) enabled. Migrations live in `supabase/migrations/`, seed data (82 Smash Bros characters) in `supabase/seed.sql`.

Realtime subscriptions are active on `rooms` and `matches` tables (Postgres Changes).

### Key Algorithms

- **Match generation** (`Room.tsx`): Creates all unique player pairs, then reorders to minimize consecutive matches for the same player. Supports incremental rounds when new players join.
- **ELO calculation** (`elo.ts`): Standard formula with K-factor 32, recalculated on every match completion.

## Conventions

- **State management:** React hooks only (`useState`, `useEffect`, `useCallback`, `useRef`). No Redux/Zustand/Context.
- **Data access:** Direct Supabase client calls — no abstraction layer. Check for `error` in responses.
- **Component style:** Functional components with hooks. No class components.
- **Naming:** camelCase for variables/functions, PascalCase for components.
- **UI patterns:** `active:scale-95` for tap feedback, `opacity-50` for disabled states, green/red for win/loss, toast notifications for user feedback.
- **Character images:** Loaded from Nintendo CDN (`smashbros.com/assets_v2/img/fighter/thumb_a/{slug}.png`).

## Environment Variables

Uses Vite's `VITE_` prefix convention:

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous key

Defined in `.env.development` for local dev.

## TypeScript Configuration

Project references pattern with strict mode enabled. `noUnusedLocals` and `noUnusedParameters` are enforced. Target is ES2022 for app code, ES2023 for build tooling.
