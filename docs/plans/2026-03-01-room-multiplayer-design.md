# Room Multiplayer Design

## Summary

Add room-based multiplayer to Smash Match Maker so multiple people can view the same match state in real-time. The room creator controls everything (add players, generate matches, reorder, mark complete); others are view-only.

## Backend: Supabase

Using Supabase for storage and real-time sync. No custom server needed.

## Database Schema

Single `rooms` table:

```sql
create table rooms (
  id bigint generated always as identity primary key,
  room_code int unique not null,        -- 4-digit code (1000-9999)
  creator_token uuid not null,          -- stored in creator's browser
  players text[] not null default '{}', -- array of player names
  matches jsonb not null default '[]',  -- [{id, player1, player2, completed, winner}]
  created_at timestamptz default now()
);
```

- `room_code`: 4-digit number for verbal sharing
- `creator_token`: random UUID generated client-side, authorizes writes (no auth system)
- `matches`: JSONB array — each match: `{id: string, player1: string, player2: string, completed: boolean, winner: string | null}`
- Rows older than 24h are considered expired

Row-Level Security: anyone can `SELECT`, only matching `creator_token` can `INSERT`/`UPDATE`.

## User Flow

### Landing Screen
- App title
- "Create Room" button — creates room, navigates to room view as creator
- "Join Room" button — input for 4-digit code, navigates to room view as viewer

### Room View (Creator)
- Room code displayed prominently at top
- Same UI as current app: add/remove players, generate matches, drag-reorder, tap-to-complete
- All changes write to Supabase

### Room View (Viewer)
- Read-only: same layout, no edit controls, no drag handles
- Room code and "Leave Room" button
- Auto-updates via Supabase Realtime subscription

## Real-time Sync

- Client subscribes to Postgres Changes on `rooms` table filtered by `room_code`
- Creator: optimistic local update, then write to Supabase
- Viewer: replace local state with incoming Realtime payload
- Single source of truth in Supabase, one subscription, one-way data flow

## Edge Cases

- Room not found → error, return to landing
- Room expired (>24h) → treat as not found
- Creator closes browser → room persists 24h, viewers see last state
- Network disconnect → Supabase client auto-reconnects

## Project Structure

```
src/
  App.tsx        — landing screen + routing (conditional rendering)
  Room.tsx       — room view (creator/viewer based on role)
  supabase.ts    — Supabase client init
  types.ts       — shared types (Room, Match, Role)
```

New dependency: `@supabase/supabase-js`

Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## Future Extensibility

- `winner` field on matches is `null` for now, ready for score tracking later
