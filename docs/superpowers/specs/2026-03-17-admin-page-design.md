# Admin Page Design

## Overview

Password-protected admin page for adjusting match results, managing player names, and recalculating ELO scores. Accessible at `/admin` (no link from main app).

## Server-side Auth

- Postgres function `verify_admin_password(password text) returns boolean`
- Password hash stored via `ALTER DATABASE ... SET app.admin_password_hash`
- Uses pgcrypto `crypt()` to verify bcrypt hash of `Password0129`
- No tokens/sessions — client stores auth state in React state (resets on refresh)
- RPC call: `supabase.rpc('verify_admin_password', { password })`

## Database Changes

**New migration only** — no new tables.

Migration contents:
1. Enable pgcrypto extension (if not already)
2. Set `app.admin_password_hash` to bcrypt hash of `Password0129`
3. Create `verify_admin_password(password text) returns boolean` function using `crypt()`

## Admin Page UI

### Route
`/admin` — new component `src/Admin.tsx`

### Login Screen
- Centered card with password input and "Login" button
- Error message on incorrect password
- Dark theme matching existing app (neutral-800/900, amber accents)

### Authenticated View

#### Matches Management
- All completed matches listed, grouped by round (most recent first)
- Each row: player1 vs player2, winner highlighted in green
- Click either player name to swap winner
- Delete button per match (with confirmation)
- "Recalculate ELO" button at top

#### Player Names
- List all players from `player_defaults`
- Inline edit: tap name → text input, save on Enter/blur
- Rename updates across: `player_defaults`, `player_scores`, `matches` (player1, player2, winner)

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
Update match winner/completed in matches table → recalculateScores()
```

### Delete Match
```
Delete from matches table → recalculateScores()
```

### Edit Player Name
```
Update player_defaults.player_name
→ Update matches (player1, player2, winner where applicable)
→ Update player_scores.player_name
→ recalculateScores()
```

## Files to Create/Modify

- **Create:** `src/Admin.tsx` — admin page component
- **Create:** `supabase/migrations/<timestamp>_admin_password.sql` — RPC function + password hash
- **Modify:** `src/App.tsx` — add `/admin` route
