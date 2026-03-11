# Scoreboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a global Elo-based scoreboard page that ranks players based on all historical match results.

**Architecture:** Elo ratings are computed client-side by replaying all completed matches chronologically, then persisted to a `player_scores` table via upsert. Recalculation is triggered after every winner set/clear. A new `/scoreboard` route displays the ranked leaderboard.

**Tech Stack:** React, TypeScript, Supabase (migration + client), Tailwind CSS v4

---

### Task 1: Create `player_scores` table migration

**Files:**
- Create: `supabase/migrations/20260311000000_create_player_scores.sql`

**Step 1: Create the migration file**

```sql
create table if not exists public.player_scores (
  player_name text primary key,
  elo_rating integer not null default 1000,
  wins integer not null default 0,
  losses integer not null default 0
);

alter table public.player_scores enable row level security;

create policy "Allow public read" on public.player_scores for select using (true);
create policy "Allow public insert" on public.player_scores for insert with check (true);
create policy "Allow public update" on public.player_scores for update using (true);
```

**Step 2: Apply the migration**

Run via Supabase MCP tool: `mcp__plugin_supabase_supabase__apply_migration`

**Step 3: Commit**

```
feat: add player_scores table migration
```

---

### Task 2: Add Elo computation utility

**Files:**
- Create: `src/elo.ts`

**Step 1: Write the Elo calculation module**

```typescript
import type { Match } from './types.ts'
import { supabase } from './supabase.ts'

const K = 32
const DEFAULT_ELO = 1000

function expectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400))
}

interface PlayerScore {
  player_name: string
  elo_rating: number
  wins: number
  losses: number
}

export async function recalculateScores(): Promise<void> {
  // Fetch all completed matches globally, ordered chronologically
  const { data: matches } = await supabase
    .from('matches')
    .select('player1, player2, winner')
    .eq('completed', true)
    .not('winner', 'is', null)
    .order('id')

  if (!matches) return

  // Replay all matches from scratch
  const ratings = new Map<string, number>()
  const wins = new Map<string, number>()
  const losses = new Map<string, number>()

  for (const m of matches as Pick<Match, 'player1' | 'player2' | 'winner'>[]) {
    if (!m.winner) continue

    const loser = m.winner === m.player1 ? m.player2 : m.player1

    // Initialize if new
    if (!ratings.has(m.winner)) ratings.set(m.winner, DEFAULT_ELO)
    if (!ratings.has(loser)) ratings.set(loser, DEFAULT_ELO)

    const winnerElo = ratings.get(m.winner)!
    const loserElo = ratings.get(loser)!

    const winnerExpected = expectedScore(winnerElo, loserElo)
    const loserExpected = expectedScore(loserElo, winnerElo)

    ratings.set(m.winner, Math.round(winnerElo + K * (1 - winnerExpected)))
    ratings.set(loser, Math.round(loserElo + K * (0 - loserExpected)))

    wins.set(m.winner, (wins.get(m.winner) ?? 0) + 1)
    losses.set(loser, (losses.get(loser) ?? 0) + 1)
  }

  // Build upsert rows
  const rows: PlayerScore[] = []
  for (const [name, elo] of ratings) {
    rows.push({
      player_name: name,
      elo_rating: elo,
      wins: wins.get(name) ?? 0,
      losses: losses.get(name) ?? 0,
    })
  }

  if (rows.length > 0) {
    await supabase
      .from('player_scores')
      .upsert(rows, { onConflict: 'player_name' })
  }
}
```

**Step 2: Commit**

```
feat: add Elo rating computation module
```

---

### Task 3: Trigger recalculation after winner changes

**Files:**
- Modify: `src/Room.tsx` — `selectWinner` function (around line 608)

**Step 1: Import recalculateScores**

Add at top of `src/Room.tsx`:

```typescript
import { recalculateScores } from './elo.ts'
```

**Step 2: Call recalculation after winner update**

In `selectWinner`, add `recalculateScores()` call after the DB update succeeds. Fire-and-forget (no await needed — don't block the UI):

```typescript
const selectWinner = async (id: number, player: string) => {
  const match = matches.find(m => m.id === id)
  if (!match || savingMatchIds.has(id)) return
  const newWinner = match.winner === player ? null : player
  const newCompleted = newWinner !== null
  setSavingMatchIds(prev => new Set(prev).add(id))
  await supabase.from('matches').update({ winner: newWinner, completed: newCompleted }).eq('id', id)
  setSavingMatchIds(prev => { const next = new Set(prev); next.delete(id); return next })
  recalculateScores()
}
```

**Step 3: Commit**

```
feat: trigger Elo recalculation on winner change
```

---

### Task 4: Create Scoreboard page component

**Files:**
- Create: `src/Scoreboard.tsx`

**Step 1: Write the Scoreboard component**

Follows the same patterns as `Stats.tsx` — fetches data on mount, displays a ranked table. Uses `player_defaults` for character avatars.

```typescript
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { Character } from './types.ts'
import { supabase } from './supabase.ts'

const CHARACTER_IMAGE_BASE = 'https://www.smashbros.com/assets_v2/img/fighter/thumb_a'

interface PlayerScore {
  player_name: string
  elo_rating: number
  wins: number
  losses: number
}

export function Scoreboard() {
  const [scores, setScores] = useState<PlayerScore[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [defaults, setDefaults] = useState<Record<string, number | null>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: scoreData }, { data: chars }, { data: playerDefs }] = await Promise.all([
        supabase
          .from('player_scores')
          .select('*')
          .order('elo_rating', { ascending: false }),
        supabase.from('characters').select('*').order('fighter_number'),
        supabase.from('player_defaults').select('player_name, default_character_id'),
      ])

      if (scoreData) setScores(scoreData as PlayerScore[])
      if (chars) setCharacters(chars as Character[])
      if (playerDefs) {
        const map: Record<string, number | null> = {}
        for (const d of playerDefs) {
          map[d.player_name] = d.default_character_id
        }
        setDefaults(map)
      }
      setLoading(false)
    }
    load()
  }, [])

  const charMap = new Map(characters.map(c => [c.id, c]))

  if (loading) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center">
        <p className="text-neutral-400">Loading scoreboard...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6 pt-4">
          <Link to="/" className="text-neutral-400 text-sm">← Home</Link>
          <h1 className="text-xl font-bold">
            <span className="text-white">Smash</span>
            <span className="text-amber-500 italic"> Rankings</span>
          </h1>
          <div className="w-12" />
        </div>

        {scores.length === 0 ? (
          <p className="text-neutral-400 text-center">No matches played yet.</p>
        ) : (
          <div className="bg-neutral-800 rounded-lg overflow-hidden">
            {scores.map((score, idx) => {
              const charId = defaults[score.player_name]
              const char = charId ? charMap.get(charId) : null
              return (
                <div
                  key={score.player_name}
                  className={`flex items-center gap-3 px-4 py-3 ${idx > 0 ? 'border-t border-neutral-700/50' : ''}`}
                >
                  <span className={`w-8 text-center font-bold text-lg ${
                    idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-neutral-300' : idx === 2 ? 'text-orange-400' : 'text-neutral-500'
                  }`}>
                    {idx + 1}
                  </span>
                  {char ? (
                    <img
                      src={`${CHARACTER_IMAGE_BASE}/${char.image_slug}.png`}
                      alt={char.name}
                      className="w-10 h-10 rounded-full object-cover bg-neutral-600"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-neutral-600 flex items-center justify-center text-neutral-400 text-sm">
                      {score.player_name[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">{score.player_name}</div>
                    <div className="text-neutral-400 text-xs">
                      {score.wins}W - {score.losses}L
                    </div>
                  </div>
                  <span className={`text-lg font-bold ${
                    score.elo_rating >= 1000 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {score.elo_rating}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```
feat: add Scoreboard page component
```

---

### Task 5: Add route and navigation

**Files:**
- Modify: `src/App.tsx`

**Step 1: Add import and route**

Add import at top of `src/App.tsx`:

```typescript
import { Scoreboard } from './Scoreboard.tsx'
```

Add route inside `<Routes>`:

```tsx
<Route path="/scoreboard" element={<Scoreboard />} />
```

**Step 2: Add navigation link on Home page**

Add a "Rankings" button below the existing buttons in the Home component, after the Join Room button/section (around line 196, before the error display). Add it inside the `<div className="w-full space-y-4">` block:

```tsx
<Link
  to="/scoreboard"
  className="w-full py-4 bg-neutral-800 text-amber-500 text-xl font-bold uppercase rounded-lg active:scale-[0.98] transition-transform text-center block"
>
  Rankings
</Link>
```

Also add `Link` to the import from `react-router-dom`:

```typescript
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
```

**Step 3: Commit**

```
feat: add scoreboard route and navigation link
```

---

### Task 6: Verify end-to-end

**Step 1: Run dev server**

```
pnpm dev
```

**Step 2: Manual verification checklist**

- [ ] Navigate to `/scoreboard` — shows empty state
- [ ] Create room, add players, generate matches
- [ ] Select a winner — scoreboard should update
- [ ] Toggle winner off — scoreboard should recalculate
- [ ] Navigate to Rankings from home page
- [ ] Verify Elo: beating higher-rated player gives more points

**Step 3: Run build to check for type errors**

```
pnpm build
```

**Step 4: Final commit if any fixes needed**
