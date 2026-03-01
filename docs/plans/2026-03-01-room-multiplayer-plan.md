# Room Multiplayer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add room-based multiplayer so a creator can share a room code and viewers can watch match state in real-time.

**Architecture:** Supabase single `rooms` table with JSONB matches column. Creator writes, viewers subscribe via Supabase Realtime. No auth — creator identified by a UUID token stored in localStorage.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS v4, Supabase (Postgres + Realtime), @supabase/supabase-js

**Design doc:** `docs/plans/2026-03-01-room-multiplayer-design.md`

---

### Task 1: Set up Supabase project and database

**Step 1: Create Supabase project**

Use the Supabase MCP tools to create a new project or use an existing one. Then run this SQL to create the `rooms` table:

```sql
create table rooms (
  id bigint generated always as identity primary key,
  room_code int unique not null,
  creator_token uuid not null,
  players text[] not null default '{}',
  matches jsonb not null default '[]',
  created_at timestamptz default now()
);
```

**Step 2: Enable Row-Level Security**

```sql
alter table rooms enable row level security;

-- Anyone can read rooms
create policy "rooms_select" on rooms for select using (true);

-- Anyone can insert (creator_token is set client-side)
create policy "rooms_insert" on rooms for insert with check (true);

-- Only creator can update their room
create policy "rooms_update" on rooms for update using (
  creator_token = (current_setting('request.headers', true)::json->>'x-creator-token')::uuid
);
```

**Step 3: Enable Realtime on the rooms table**

```sql
alter publication supabase_realtime add table rooms;
```

**Step 4: Verify**

Run: `select * from rooms;` via MCP to confirm table exists.

**Step 5: Commit** (nothing to commit yet — DB is remote)

---

### Task 2: Install dependency and create Supabase client

**Files:**
- Create: `src/supabase.ts`
- Create: `.env.local`
- Modify: `.gitignore`

**Step 1: Install @supabase/supabase-js**

Run: `pnpm add @supabase/supabase-js`

**Step 2: Create `.env.local`**

```
VITE_SUPABASE_URL=<url from Supabase project>
VITE_SUPABASE_ANON_KEY=<anon key from Supabase project>
```

**Step 3: Add `.env.local` to `.gitignore` (if not already covered by `*.local`)**

Check `.gitignore` — it already has `*.local`, so `.env.local` is covered. No change needed.

**Step 4: Create `src/supabase.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

**Step 5: Verify**

Run: `pnpm build`
Expected: Build succeeds with no errors.

**Step 6: Commit**

```bash
git add src/supabase.ts package.json pnpm-lock.yaml
git commit -m "feat: add Supabase client and dependency"
```

---

### Task 3: Create shared types

**Files:**
- Create: `src/types.ts`

**Step 1: Create `src/types.ts`**

```typescript
export interface Match {
  id: string
  player1: string
  player2: string
  completed: boolean
  winner: string | null
}

export interface Room {
  id: number
  room_code: number
  creator_token: string
  players: string[]
  matches: Match[]
  created_at: string
}

export type Role = 'creator' | 'viewer'
```

**Step 2: Verify**

Run: `pnpm build`
Expected: Build succeeds. (Types are unused for now — `noUnusedLocals` won't trigger because they're exports.)

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared types for room multiplayer"
```

---

### Task 4: Build landing screen

**Files:**
- Modify: `src/App.tsx`

Replace the current `App.tsx` with a landing screen that has "Create Room" and "Join Room" buttons. The current match-maker UI will move to `Room.tsx` in the next task.

**Step 1: Rewrite `src/App.tsx`**

```tsx
import { useState } from 'react'
import { supabase } from './supabase.ts'
import { Room } from './Room.tsx'
import type { Role } from './types.ts'

const CREATOR_TOKEN_KEY = 'smash-creator-token'

function generateCreatorToken(): string {
  return crypto.randomUUID()
}

function App() {
  const [roomCode, setRoomCode] = useState<number | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [joinInput, setJoinInput] = useState('')
  const [showJoin, setShowJoin] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const createRoom = async () => {
    setLoading(true)
    setError('')
    const token = generateCreatorToken()
    const code = Math.floor(1000 + Math.random() * 9000)

    const { error: insertError } = await supabase
      .from('rooms')
      .insert({ room_code: code, creator_token: token })

    if (insertError) {
      // room_code collision — retry once
      const retryCode = Math.floor(1000 + Math.random() * 9000)
      const { error: retryError } = await supabase
        .from('rooms')
        .insert({ room_code: retryCode, creator_token: token })

      if (retryError) {
        setError('Failed to create room. Try again.')
        setLoading(false)
        return
      }
      localStorage.setItem(CREATOR_TOKEN_KEY, token)
      setRoomCode(retryCode)
    } else {
      localStorage.setItem(CREATOR_TOKEN_KEY, token)
      setRoomCode(code)
    }
    setRole('creator')
    setLoading(false)
  }

  const joinRoom = async () => {
    setLoading(true)
    setError('')
    const code = parseInt(joinInput, 10)
    if (isNaN(code) || code < 1000 || code > 9999) {
      setError('Enter a valid 4-digit room code.')
      setLoading(false)
      return
    }

    const { data, error: fetchError } = await supabase
      .from('rooms')
      .select('room_code, created_at')
      .eq('room_code', code)
      .single()

    if (fetchError || !data) {
      setError('Room not found.')
      setLoading(false)
      return
    }

    // Check if room is expired (>24h)
    const created = new Date(data.created_at).getTime()
    if (Date.now() - created > 24 * 60 * 60 * 1000) {
      setError('Room has expired.')
      setLoading(false)
      return
    }

    setRoomCode(code)
    setRole('viewer')
    setLoading(false)
  }

  const leaveRoom = () => {
    setRoomCode(null)
    setRole(null)
    setJoinInput('')
    setShowJoin(false)
    setError('')
  }

  if (roomCode && role) {
    return (
      <Room
        roomCode={roomCode}
        role={role}
        creatorToken={role === 'creator' ? localStorage.getItem(CREATOR_TOKEN_KEY)! : null}
        onLeave={leaveRoom}
      />
    )
  }

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="max-w-md mx-auto flex flex-col items-center justify-center min-h-[80vh]">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-center">
            <span className="text-white">Smash</span>
            <span className="text-amber-500 italic"> Match Maker</span>
          </h1>
        </div>

        {/* Buttons */}
        <div className="w-full space-y-4">
          <button
            onClick={createRoom}
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 text-white text-xl font-bold uppercase rounded-lg disabled:opacity-50 active:scale-[0.98] transition-transform shadow-lg shadow-orange-500/30"
          >
            {loading ? 'Creating...' : 'Create Room'}
          </button>

          {!showJoin ? (
            <button
              onClick={() => setShowJoin(true)}
              className="w-full py-4 bg-neutral-700 text-white text-xl font-bold uppercase rounded-lg active:scale-[0.98] transition-transform"
            >
              Join Room
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                placeholder="Room Code"
                className="flex-1 px-4 py-3 rounded-lg bg-neutral-800 border border-neutral-600 text-white placeholder-neutral-400 text-lg text-center tracking-widest focus:outline-none focus:border-neutral-500"
                autoFocus
              />
              <button
                onClick={joinRoom}
                disabled={loading || joinInput.length !== 4}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold uppercase text-sm disabled:opacity-50"
              >
                Join
              </button>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-4 text-red-400 text-center">{error}</p>
        )}
      </div>
    </div>
  )
}

export default App
```

**Step 2: Verify**

Run: `pnpm build`
Expected: Will fail because `Room.tsx` doesn't exist yet. That's OK — move to next task.

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add landing screen with create/join room"
```

---

### Task 5: Extract Room component (creator mode)

**Files:**
- Create: `src/Room.tsx`

Move the current match-maker UI from the old `App.tsx` into `Room.tsx`. This task handles the **creator** role — full interactivity.

**Step 1: Create `src/Room.tsx`**

This is the existing match UI adapted to accept props and work within a room context. Key changes from old `App.tsx`:
- Receives `roomCode`, `role`, `creatorToken`, `onLeave` as props
- Shows room code at top
- Has a "Leave Room" button
- Still uses local state for now (Supabase sync added in Task 7)
- Keeps `localStorage` for player names (creator only)

```tsx
import { useState, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Match, Role } from './types.ts'

const STORAGE_KEY = 'smash-match-maker-names'

function SortableMatch({
  match,
  index,
  done,
  onToggle,
  isCreator,
}: {
  match: Match
  index: number
  done: boolean
  onToggle: () => void
  isCreator: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: match.id, disabled: !isCreator })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center rounded-lg px-4 py-3 mb-2 last:mb-0 select-none transition-all ${isDragging ? 'bg-neutral-600 shadow-lg' : done ? 'bg-neutral-800/50 opacity-40' : 'bg-neutral-700/50'}`}
    >
      {isCreator && (
        <span
          {...attributes}
          {...listeners}
          className="text-neutral-500 mr-2 cursor-grab active:cursor-grabbing touch-none"
        >
          ⠿
        </span>
      )}
      <span className="text-neutral-500 text-sm w-8">{index + 1}.</span>
      <div
        onClick={isCreator ? onToggle : undefined}
        className={`flex-1 flex items-center justify-center gap-3 font-medium ${isCreator ? 'cursor-pointer' : ''} ${done ? 'line-through text-neutral-500' : 'text-white'}`}
      >
        <span>{match.player1}</span>
        <span className={`font-bold ${done ? 'text-neutral-500' : 'text-amber-500'}`}>VS</span>
        <span>{match.player2}</span>
      </div>
    </div>
  )
}

let matchIdCounter = 0

interface RoomProps {
  roomCode: number
  role: Role
  creatorToken: string | null
  onLeave: () => void
}

export function Room({ roomCode, role, creatorToken, onLeave }: RoomProps) {
  const isCreator = role === 'creator'
  const [names, setNames] = useState<string[]>([])
  const [newName, setNewName] = useState('')
  const [matches, setMatches] = useState<Match[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  // Load saved names (creator only)
  useEffect(() => {
    if (isCreator) {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        try { setNames(JSON.parse(saved)) } catch { /* ignore */ }
      }
    }
  }, [isCreator])

  // Save names to localStorage (creator only)
  useEffect(() => {
    if (isCreator) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(names))
    }
  }, [names, isCreator])

  const addName = () => {
    const trimmed = newName.trim()
    if (trimmed && !names.includes(trimmed)) {
      setNames([...names, trimmed])
      setNewName('')
    }
  }

  const removeName = (nameToRemove: string) => {
    setNames(names.filter(name => name !== nameToRemove))
    setMatches([])
  }

  const clearAll = () => {
    if (confirm('Clear all players?')) {
      setNames([])
      setMatches([])
    }
  }

  const generateMatches = () => {
    const allPairs: Match[] = []
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        allPairs.push({
          id: `match-${++matchIdCounter}`,
          player1: names[i],
          player2: names[j],
          completed: false,
          winner: null,
        })
      }
    }

    const shuffled = allPairs.sort(() => Math.random() - 0.5)
    const result: Match[] = []
    const remaining = [...shuffled]

    while (remaining.length > 0) {
      if (result.length === 0) {
        result.push(remaining.shift()!)
      } else {
        const lastMatch = result[result.length - 1]
        const lastPlayers = [lastMatch.player1, lastMatch.player2]
        const nextIdx = remaining.findIndex(
          m => !lastPlayers.includes(m.player1) && !lastPlayers.includes(m.player2)
        )
        if (nextIdx !== -1) {
          result.push(remaining.splice(nextIdx, 1)[0])
        } else {
          result.push(remaining.shift()!)
        }
      }
    }

    setMatches(result)
  }

  const toggleMatch = (id: string) => {
    setMatches(prev =>
      prev.map(m => m.id === id ? { ...m, completed: !m.completed } : m)
    )
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setMatches(prev => {
        const oldIndex = prev.findIndex(m => m.id === active.id)
        const newIndex = prev.findIndex(m => m.id === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  const completedCount = matches.filter(m => m.completed).length
  const totalMatches = names.length * (names.length - 1) / 2

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="max-w-md mx-auto">
        {/* Header with room code */}
        <div className="flex items-center justify-between mb-4 pt-4">
          <button onClick={onLeave} className="text-neutral-400 text-sm">
            ← Leave
          </button>
          <div className="text-center">
            <h1 className="text-xl font-bold">
              <span className="text-white">Smash</span>
              <span className="text-amber-500 italic"> Match Maker</span>
            </h1>
          </div>
          <div className="text-right">
            <div className="text-neutral-400 text-xs uppercase">Room</div>
            <div className="text-white font-bold text-lg tracking-widest">{roomCode}</div>
          </div>
        </div>

        {/* Role badge */}
        {!isCreator && (
          <div className="text-center mb-4">
            <span className="text-xs bg-neutral-700 text-neutral-300 px-3 py-1 rounded-full uppercase">
              View Only
            </span>
          </div>
        )}

        {/* Add Name (creator only) */}
        {isCreator && (
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addName()}
              placeholder="Enter Player Name"
              className="flex-1 px-4 py-3 rounded-lg bg-neutral-800 border border-neutral-600 text-white placeholder-neutral-400 text-lg focus:outline-none focus:border-neutral-500"
            />
            <button
              onClick={addName}
              disabled={!newName.trim()}
              className="px-4 py-3 bg-blue-600 text-white rounded-lg font-bold uppercase text-sm disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}

        {/* Players List */}
        <div className="bg-neutral-800 rounded-lg mb-4 overflow-hidden">
          <div className="flex justify-between items-center px-4 py-3 bg-neutral-700">
            <span className="text-white font-bold uppercase text-sm">Players ({names.length})</span>
            {isCreator && names.length > 0 && (
              <button onClick={clearAll} className="text-sm text-red-400 hover:text-red-300">
                Clear
              </button>
            )}
          </div>
          <div className="p-4">
            {names.length === 0 ? (
              <p className="text-neutral-400 text-center py-2">
                {isCreator ? 'Add at least 2 players to begin matchmaking.' : 'Waiting for players...'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {names.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-neutral-700 rounded-full text-white"
                  >
                    {name}
                    {isCreator && (
                      <button
                        onClick={() => removeName(name)}
                        className="ml-1 text-neutral-400 hover:text-white"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Generate Button (creator only) */}
        {isCreator && (
          <button
            onClick={generateMatches}
            disabled={names.length < 2}
            className="w-full py-4 bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 text-white text-xl font-bold uppercase rounded-lg disabled:opacity-50 active:scale-[0.98] transition-transform mb-4 shadow-lg shadow-orange-500/30"
          >
            Generate {totalMatches > 0 ? `${totalMatches} Matches` : 'Matches'}
          </button>
        )}

        {/* Match List */}
        {matches.length > 0 && (
          <div className="bg-neutral-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-neutral-700">
              <span className="text-white font-bold uppercase text-sm">
                Match Order ({completedCount}/{matches.length})
              </span>
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={matches.map(m => m.id)} strategy={verticalListSortingStrategy}>
                <div className="p-2">
                  {matches.map((match, idx) => (
                    <SortableMatch
                      key={match.id}
                      match={match}
                      index={idx}
                      done={match.completed}
                      onToggle={() => toggleMatch(match.id)}
                      isCreator={isCreator}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Verify**

Run: `pnpm build`
Expected: Build succeeds. `creatorToken` will show as unused — add a `void creatorToken` or prefix with `_` for now; it will be used in Task 7.

**Step 3: Verify manually**

Run: `pnpm dev`
- Landing screen shows with Create/Join buttons
- Create Room should create a room in Supabase and navigate to the room view
- Room view should work the same as the old app (add players, generate, reorder, complete)

**Step 4: Commit**

```bash
git add src/Room.tsx src/App.tsx
git commit -m "feat: add Room component with creator/viewer UI"
```

---

### Task 6: Wire up Supabase sync for creator

**Files:**
- Modify: `src/Room.tsx`

Add Supabase writes so every creator action (add/remove player, generate matches, toggle match, reorder) persists to the database.

**Step 1: Add a sync helper and update all mutation functions**

At the top of `Room.tsx`, import supabase:

```typescript
import { supabase } from './supabase.ts'
```

Add a `syncRoom` helper inside the `Room` component:

```typescript
const syncRoom = async (updates: { players?: string[]; matches?: Match[] }) => {
  if (!isCreator || !creatorToken) return
  await supabase
    .from('rooms')
    .update(updates)
    .eq('room_code', roomCode)
    .eq('creator_token', creatorToken)
}
```

Update each mutation to also call `syncRoom`:

- `addName`: after updating state, call `syncRoom({ players: [...names, trimmed] })`
- `removeName`: call `syncRoom({ players: names.filter(...), matches: [] })`
- `clearAll`: call `syncRoom({ players: [], matches: [] })`
- `generateMatches`: call `syncRoom({ matches: result })`
- `toggleMatch`: call `syncRoom({ matches: updatedMatches })`
- `handleDragEnd`: call `syncRoom({ matches: reorderedMatches })`

Each function should compute the new value, set local state, and pass the same new value to `syncRoom`.

**Step 2: Load initial room state from Supabase (for creator resuming)**

Add an effect that loads room state on mount:

```typescript
useEffect(() => {
  const loadRoom = async () => {
    const { data } = await supabase
      .from('rooms')
      .select('players, matches')
      .eq('room_code', roomCode)
      .single()
    if (data) {
      setNames(data.players)
      setMatches(data.matches as Match[])
    }
  }
  loadRoom()
}, [roomCode])
```

**Step 3: Verify**

Run: `pnpm dev`
- Create a room, add players, generate matches
- Check Supabase dashboard or run `select * from rooms` via MCP — data should be there
- Refresh the page (re-create room) — not expected to persist across refreshes yet (that's fine)

**Step 4: Commit**

```bash
git add src/Room.tsx
git commit -m "feat: sync creator actions to Supabase"
```

---

### Task 7: Add Realtime subscription for viewers

**Files:**
- Modify: `src/Room.tsx`

**Step 1: Subscribe to Realtime changes**

Add a `useEffect` that subscribes to Postgres Changes for the room:

```typescript
useEffect(() => {
  const channel = supabase
    .channel(`room-${roomCode}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `room_code=eq.${roomCode}`,
      },
      (payload) => {
        const newData = payload.new as Room
        setNames(newData.players)
        setMatches(newData.matches)
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [roomCode])
```

Import the `Room` type (rename component prop interface to avoid conflict — e.g., rename it to `RoomProps` which it already is).

Import the `Room` type from types: `import type { Match, Role, Room as RoomData } from './types.ts'` and use `RoomData` in the payload cast.

**Step 2: Verify with two browser windows**

Run: `pnpm dev`
1. Open window 1 — Create Room, note the room code
2. Open window 2 — Join Room with the code
3. In window 1 (creator): add players → should appear in window 2
4. In window 1: generate matches → should appear in window 2
5. In window 1: toggle a match complete → should update in window 2
6. In window 1: reorder matches → should update in window 2

**Step 3: Commit**

```bash
git add src/Room.tsx
git commit -m "feat: add Realtime subscription for viewer sync"
```

---

### Task 8: Polish and edge cases

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/Room.tsx`

**Step 1: Handle room-not-found gracefully in Room component**

If the initial `loadRoom` query returns no data, call `onLeave()` with an error.

**Step 2: Prevent creating room if Supabase env vars are missing**

In `src/supabase.ts`, add a check:

```typescript
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}
```

**Step 3: Add loading state to Room component**

Show a spinner or "Loading..." while initial room data is being fetched.

**Step 4: Verify full flow end-to-end**

Run: `pnpm dev`
- Create room, add players, generate matches
- Join from second browser/tab
- Verify real-time sync works
- Try joining with invalid code — should show error
- Verify build: `pnpm build` and `pnpm lint`

**Step 5: Commit**

```bash
git add src/App.tsx src/Room.tsx src/supabase.ts
git commit -m "feat: add error handling and loading states"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Supabase project + DB schema + RLS | Remote (Supabase) |
| 2 | Install dependency + Supabase client | `supabase.ts`, `.env.local` |
| 3 | Shared types | `types.ts` |
| 4 | Landing screen | `App.tsx` |
| 5 | Room component (creator + viewer UI) | `Room.tsx` |
| 6 | Supabase writes (creator sync) | `Room.tsx` |
| 7 | Realtime subscription (viewer sync) | `Room.tsx` |
| 8 | Polish + error handling | `App.tsx`, `Room.tsx`, `supabase.ts` |
