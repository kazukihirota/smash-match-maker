# Active Rooms Lobby — Design

## Overview
Add a public lobby to the main page showing all active rooms. Users can tap a room to join it directly. Rooms can be deactivated manually or auto-expire after 4 hours.

## Main Page Changes
The home screen gets a lobby list below the Create/Join buttons showing all active (non-expired, non-closed) rooms. Each room card shows:
- Room code
- Player names (comma-separated list or avatar row)
- Time since creation (e.g. "2h ago")
- Tapping a card joins that room directly

## Room Deactivation
- **Manual close**: "Close Room" button in the room header (next to "Leave"). Sets `is_active` column to `false`.
- **Auto-expire**: Rooms older than 4 hours are treated as inactive. Enforced in queries (`created_at > now() - interval '4 hours'`) rather than a cron job.
- Inactive rooms don't appear in the lobby and return "Room expired" if joined via code.

## Database Changes
- Add `is_active boolean default true` column to the `rooms` table
- Lobby query: `SELECT * FROM rooms WHERE is_active = true AND created_at > now() - interval '4 hours'` ordered by most recent

## Realtime
- Subscribe to the `rooms` table for INSERT/UPDATE so the lobby updates live when rooms are created or closed.

## No Changes To
- Room interior (matches, players, character picking)
- Stats page
- Manual "Join Room" by code flow (kept as fallback)
