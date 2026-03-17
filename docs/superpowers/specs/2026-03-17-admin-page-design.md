# Admin Page Design

## Overview

Password-protected admin page for adjusting match results, managing player names, and recalculating ELO scores. Accessible at `/admin` (no link from main app).

## Server-side Auth

- Postgres function `verify_admin_password(password text) returns boolean`
- Password hash stored in a single-row `admin_config` table with RLS restricted to deny all client reads
- The RPC function reads the hash internally (SECURITY DEFINER) so the client never sees it
- Uses pgcrypto `crypt()` to verify bcrypt hash of `Password0129`
- No tokens/sessions — client stores auth state in React state (resets on refresh)
- RPC call: `supabase.rpc('verify_admin_password', { password })`

## Database Changes

**New migration** — one new table + one function.

Migration contents:
1. Enable pgcrypto extension (if not already)
2. Create `admin_config` table (single row: `id integer PRIMARY KEY DEFAULT 1, password_hash text NOT NULL`)
3. RLS on `admin_config`: enable RLS, no policies (blocks all client access)
4. Insert the bcrypt hash of `Password0129`
5. Create `verify_admin_password(password text) returns boolean` as SECURITY DEFINER — reads hash from `admin_config` and compares with `crypt()`

## Admin Page UI

### Route
`/admin` — new component `src/Admin.tsx`

### Login Screen
- Centered card with password input and "Login" button
- Error message on incorrect password
- Dark theme matching existing app (neutral-800/900, amber accents)

### Authenticated View

#### Matches Management
- All matches listed, grouped by room then by round within each room (most recent first)
- Each row: player1 vs player2, winner highlighted in green
- Click either player name to change winner (only updates `winner` column; `completed` stays true)
- Delete button per match (with confirmation)
- "Recalculate ELO" button at top — runs `recalculateScores()` after changes

#### Player Names
- List all players from `player_defaults`
- Inline edit: tap name → text input, save on Enter/blur
- Validate uniqueness before saving — show error if name already exists
- Rename updates across: `player_defaults`, `player_scores`, `matches` (player1, player2, winner), and `rooms.players` array

#### Navigation
- Back arrow to Home (top left)
- No link to admin from main app — access by URL only

## Data Flow

### Password Verification
```
Client → supabase.rpc('verify_admin_password', { password }) → boolean
```

### Change Winner
```
Update match.winner in matches table → recalculateScores()
```

### Delete Match
```
Delete from matches table → recalculateScores()
```

### Edit Player Name
```
Validate new name not already in player_defaults (UNIQUE constraint)
→ Update player_defaults.player_name
→ Update matches (player1, player2, winner where applicable)
→ Update player_scores.player_name
→ Update rooms.players array (replace old name with new name)
→ recalculateScores()
```

## Files to Create/Modify

- **Create:** `src/Admin.tsx` — admin page component
- **Create:** `supabase/migrations/<timestamp>_admin_password.sql` — admin_config table + RPC function
- **Modify:** `src/App.tsx` — add `/admin` route
