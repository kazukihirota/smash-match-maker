# Admin Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a password-protected admin page at `/admin` for adjusting match winners, deleting matches, renaming players, and recalculating ELO scores.

**Architecture:** New Supabase migration creates an `admin_config` table (RLS-blocked) storing a bcrypt password hash, plus a SECURITY DEFINER RPC function for verification. A new `Admin.tsx` React component handles login and admin operations. All data mutations use the existing Supabase client and `recalculateScores()` from `src/elo.ts`.

**Tech Stack:** React, TypeScript, Supabase (Postgres + pgcrypto), Tailwind CSS v4, react-router-dom

---

## Chunk 1: Database Migration

### Task 1: Create admin password migration

**Files:**
- Create: `supabase/migrations/20260317100000_admin_password.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Enable pgcrypto for bcrypt
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Admin config table (single row, no client access)
CREATE TABLE admin_config (
  id integer PRIMARY KEY DEFAULT 1,
  password_hash text NOT NULL,
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;
-- No policies = no client can read/write directly

-- Insert bcrypt hash of 'Password0129'
INSERT INTO admin_config (password_hash)
VALUES (crypt('Password0129', gen_salt('bf')));

-- RPC function: verify password server-side
CREATE OR REPLACE FUNCTION verify_admin_password(password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stored_hash text;
BEGIN
  SELECT password_hash INTO stored_hash FROM admin_config WHERE id = 1;
  IF stored_hash IS NULL THEN
    RETURN false;
  END IF;
  RETURN crypt(password, stored_hash) = stored_hash;
END;
$$;
```

- [ ] **Step 2: Apply migration to Supabase**

Run the migration against your Supabase project. Verify:
- `admin_config` table exists with one row
- `SELECT verify_admin_password('Password0129')` returns `true`
- `SELECT verify_admin_password('wrong')` returns `false`
- Client-side `supabase.from('admin_config').select('*')` returns empty (RLS blocks it)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260317100000_admin_password.sql
git commit -m "feat: add admin password verification migration"
```

---

## Chunk 2: Admin Page Component

### Task 2: Create Admin.tsx with login screen

**Files:**
- Create: `src/Admin.tsx`

- [ ] **Step 1: Create the Admin component with login state**

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase.ts'

export function Admin() {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('verify_admin_password', {
      password,
    })
    if (rpcError || !data) {
      setError('Incorrect password')
      setLoading(false)
      return
    }
    setAuthenticated(true)
    setLoading(false)
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-center mb-8">
            <span className="text-white">Admin</span>
            <span className="text-amber-500 italic"> Login</span>
          </h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="Password"
            className="w-full px-4 py-3 rounded-lg bg-neutral-800 border border-neutral-600 text-white placeholder-neutral-400 text-lg text-center focus:outline-none focus:border-neutral-500 mb-4"
            autoFocus
          />
          <button
            onClick={handleLogin}
            disabled={loading || !password}
            className="w-full py-3 bg-amber-600 text-white font-bold uppercase rounded-lg disabled:opacity-50 active:scale-[0.98] transition-transform cursor-pointer"
          >
            {loading ? 'Verifying...' : 'Login'}
          </button>
          {error && <p className="mt-4 text-red-400 text-center">{error}</p>}
          <Link to="/" className="block text-center mt-6 text-neutral-400 text-sm">
            &larr; Home
          </Link>
        </div>
      </div>
    )
  }

  return <AdminPanel />
}
```

- [ ] **Step 2: Commit login screen**

```bash
git add src/Admin.tsx
git commit -m "feat: add admin login screen with server-side password verification"
```

### Task 3: Build AdminPanel with match management

**Files:**
- Modify: `src/Admin.tsx`

- [ ] **Step 1: Add AdminPanel component with match loading and display**

Add the `AdminPanel` component inside `Admin.tsx` (above the `Admin` export). This component loads all matches grouped by room and round, and provides winner-swap and delete controls.

```tsx
import { useState, useEffect } from 'react'
// ... existing imports ...
import { recalculateScores } from './elo.ts'

interface MatchRow {
  id: number
  room_code: number
  round: number
  player1: string
  player2: string
  winner: string | null
  completed: boolean
}

function AdminPanel() {
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [recalculating, setRecalculating] = useState(false)

  const loadMatches = async () => {
    const { data } = await supabase
      .from('matches')
      .select('id, room_code, round, player1, player2, winner, completed')
      .order('room_code', { ascending: false })
      .order('round', { ascending: false })
      .order('id', { ascending: true })
    if (data) setMatches(data)
    setLoading(false)
  }

  useEffect(() => { loadMatches() }, [])

  const handleRecalculate = async () => {
    setRecalculating(true)
    await recalculateScores()
    setRecalculating(false)
  }

  const changeWinner = async (matchId: number, newWinner: string) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, winner: newWinner } : m))
    await supabase.from('matches').update({ winner: newWinner }).eq('id', matchId)
  }

  const deleteMatch = async (matchId: number) => {
    if (!confirm('Delete this match?')) return
    setMatches(prev => prev.filter(m => m.id !== matchId))
    await supabase.from('matches').delete().eq('id', matchId)
  }

  // Group matches by room_code, then by round
  const grouped = matches.reduce<Record<number, Record<number, MatchRow[]>>>((acc, m) => {
    if (!acc[m.room_code]) acc[m.room_code] = {}
    if (!acc[m.room_code][m.round]) acc[m.room_code][m.round] = []
    acc[m.room_code][m.round].push(m)
    return acc
  }, {})

  const roomCodes = Object.keys(grouped).map(Number).sort((a, b) => b - a)

  if (loading) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center">
        <p className="text-neutral-400">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6 pt-4">
          <Link to="/" className="text-amber-500 text-sm font-medium">&larr; Home</Link>
          <h1 className="text-xl font-bold">
            <span className="text-white">Admin</span>
            <span className="text-amber-500 italic"> Panel</span>
          </h1>
          <div className="w-14" />
        </div>

        {/* Recalculate ELO */}
        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          className="w-full py-3 bg-green-700 text-white font-bold uppercase rounded-lg disabled:opacity-50 active:scale-[0.98] transition-transform mb-4 cursor-pointer"
        >
          {recalculating ? 'Recalculating...' : 'Recalculate ELO'}
        </button>

        {/* Player Names Section - added in Task 4 */}

        {/* Matches Section */}
        <h2 className="text-neutral-400 text-xs font-bold uppercase mb-3 tracking-wider">Matches</h2>
        {roomCodes.length === 0 ? (
          <p className="text-neutral-400 text-center">No matches found.</p>
        ) : (
          roomCodes.map(roomCode => {
            const rounds = Object.keys(grouped[roomCode]).map(Number).sort((a, b) => b - a)
            return (
              <div key={roomCode} className="mb-6">
                <h3 className="text-white font-bold text-sm mb-2">Room {roomCode}</h3>
                {rounds.map(round => (
                  <div key={round} className="bg-neutral-800 rounded-lg overflow-hidden mb-3">
                    <div className="px-4 py-2 bg-neutral-700">
                      <span className="text-neutral-300 text-xs font-bold uppercase">Round {round}</span>
                    </div>
                    <div className="p-2">
                      {grouped[roomCode][round].map(match => (
                        <div key={match.id} className="flex items-center gap-2 px-3 py-2 mb-1 last:mb-0 bg-neutral-700/50 rounded-lg">
                          <button
                            onClick={() => changeWinner(match.id, match.player1)}
                            className={`flex-1 text-sm text-right px-2 py-1 rounded cursor-pointer active:scale-95 transition-all ${
                              match.winner === match.player1
                                ? 'bg-green-600/30 text-green-400 font-bold'
                                : 'text-white'
                            }`}
                          >
                            {match.player1}
                          </button>
                          <span className="text-amber-500 text-xs font-bold">VS</span>
                          <button
                            onClick={() => changeWinner(match.id, match.player2)}
                            className={`flex-1 text-sm text-left px-2 py-1 rounded cursor-pointer active:scale-95 transition-all ${
                              match.winner === match.player2
                                ? 'bg-green-600/30 text-green-400 font-bold'
                                : 'text-white'
                            }`}
                          >
                            {match.player2}
                          </button>
                          <button
                            onClick={() => deleteMatch(match.id)}
                            className="text-red-400 text-sm ml-1 px-1 cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit match management**

```bash
git add src/Admin.tsx
git commit -m "feat: add admin panel with match management"
```

### Task 4: Add player name management

**Files:**
- Modify: `src/Admin.tsx`

- [ ] **Step 1: Add PlayerManager section to AdminPanel**

Add a `PlayerManager` component inside `Admin.tsx`. It lists players from `player_defaults` with inline rename. On rename, it updates `player_defaults`, `matches` (player1, player2, winner), `player_scores`, and `rooms.players`.

```tsx
interface PlayerRow {
  player_name: string
  default_character_id: number | null
}

function PlayerManager() {
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const loadPlayers = async () => {
    const { data } = await supabase
      .from('player_defaults')
      .select('player_name, default_character_id')
      .order('player_name')
    if (data) setPlayers(data)
    setLoading(false)
  }

  useEffect(() => { loadPlayers() }, [])

  const startEdit = (name: string) => {
    setEditing(name)
    setEditValue(name)
    setError('')
  }

  const saveEdit = async (oldName: string) => {
    const newName = editValue.trim()
    if (!newName || newName === oldName) {
      setEditing(null)
      return
    }

    // Check uniqueness
    if (players.some(p => p.player_name === newName)) {
      setError(`"${newName}" already exists`)
      return
    }

    setEditing(null)
    setError('')

    // Update player_defaults
    await supabase
      .from('player_defaults')
      .update({ player_name: newName })
      .eq('player_name', oldName)

    // Update matches: player1
    await supabase
      .from('matches')
      .update({ player1: newName })
      .eq('player1', oldName)

    // Update matches: player2
    await supabase
      .from('matches')
      .update({ player2: newName })
      .eq('player2', oldName)

    // Update matches: winner
    await supabase
      .from('matches')
      .update({ winner: newName })
      .eq('winner', oldName)

    // Update player_scores
    await supabase
      .from('player_scores')
      .update({ player_name: newName })
      .eq('player_name', oldName)

    // Update rooms.players array: fetch all rooms containing oldName, replace
    const { data: rooms } = await supabase
      .from('rooms')
      .select('room_code, players')
    if (rooms) {
      for (const room of rooms) {
        if (room.players.includes(oldName)) {
          const updated = room.players.map((p: string) => p === oldName ? newName : p)
          await supabase
            .from('rooms')
            .update({ players: updated })
            .eq('room_code', room.room_code)
        }
      }
    }

    await recalculateScores()
    loadPlayers()
  }

  if (loading) return null

  return (
    <div className="mb-6">
      <h2 className="text-neutral-400 text-xs font-bold uppercase mb-3 tracking-wider">Players</h2>
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
      <div className="bg-neutral-800 rounded-lg overflow-hidden">
        {players.map(player => (
          <div key={player.player_name} className="flex items-center gap-3 px-4 py-3 border-b border-neutral-700/50 last:border-b-0">
            {editing === player.player_name ? (
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit(player.player_name)
                  if (e.key === 'Escape') setEditing(null)
                }}
                onBlur={() => saveEdit(player.player_name)}
                className="flex-1 px-2 py-1 rounded bg-neutral-700 border border-neutral-500 text-white text-sm focus:outline-none"
                autoFocus
              />
            ) : (
              <span
                onClick={() => startEdit(player.player_name)}
                className="flex-1 text-white text-sm cursor-pointer"
              >
                {player.player_name}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

Then add `<PlayerManager />` in AdminPanel between the Recalculate button and the Matches section heading.

- [ ] **Step 2: Commit player management**

```bash
git add src/Admin.tsx
git commit -m "feat: add player name management to admin panel"
```

### Task 5: Add route and verify

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add /admin route to App.tsx**

In `src/App.tsx`, add the import and route:

```tsx
// Add import at top
import { Admin } from './Admin.tsx'

// Add route inside <Routes>
<Route path="/admin" element={<Admin />} />
```

- [ ] **Step 2: Verify the app builds**

Run: `pnpm build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Manual smoke test**

Run: `pnpm dev` and verify:
1. Navigate to `/admin` — see login screen
2. Enter wrong password — see "Incorrect password" error
3. Enter `Password0129` — see admin panel
4. Matches are listed grouped by room and round
5. Click a player name to change winner
6. Click ✕ to delete a match (with confirmation)
7. Click a player name in Players section to rename
8. Click "Recalculate ELO" — works without error

- [ ] **Step 4: Commit route addition**

```bash
git add src/App.tsx
git commit -m "feat: add /admin route for admin page"
```
