# Active Rooms Lobby Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a public lobby showing active rooms on the main page, with manual close and 4-hour auto-expiry.

**Architecture:** Add `is_active` column to `rooms` table. Home page fetches active rooms (is_active=true AND created_at within 4 hours) with realtime subscription. Room page gets a "Close Room" button that sets is_active=false. Join-by-code also checks active status.

**Tech Stack:** Supabase (Postgres + Realtime), React, TypeScript, Tailwind CSS

---

### Task 1: Add `is_active` column to rooms table

**Files:**
- Database migration via Supabase dashboard/MCP

**Step 1: Run migration**

Execute this SQL against the Supabase database:

```sql
ALTER TABLE rooms ADD COLUMN is_active boolean NOT NULL DEFAULT true;
```

**Step 2: Verify**

Run: `SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'rooms' AND column_name = 'is_active';`

Expected: One row showing `is_active | boolean | true`

**Step 3: Commit**

Nothing to commit (DB-only change). Move on.

---

### Task 2: Update Room type

**Files:**
- Modify: `src/types.ts`

**Step 1: Add is_active to Room interface**

In `src/types.ts`, add `is_active` to the `Room` interface:

```typescript
export interface Room {
  id: number
  room_code: number
  creator_token: string
  players: string[]
  created_at: string
  is_active: boolean
}
```

**Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add is_active field to Room type"
```

---

### Task 3: Add "Close Room" button to Room page

**Files:**
- Modify: `src/Room.tsx`

**Step 1: Add closeRoom handler**

Inside the `Room` component (after the `leaveRoom`-related code around line 281), add a `closeRoom` function:

```typescript
const closeRoom = async () => {
  await supabase
    .from('rooms')
    .update({ is_active: false })
    .eq('room_code', roomCode)
  onLeave()
}
```

**Step 2: Add Close Room button to header**

Replace the "Leave" button area in the room header (around line 597-598). Change the left side of the header from just the Leave button to include a Close button:

```tsx
<div className="flex gap-2">
  <button onClick={onLeave} className="text-neutral-400 text-sm">
    ← Leave
  </button>
  <button onClick={closeRoom} className="text-red-400 text-sm">
    Close
  </button>
</div>
```

**Step 3: Verify**

Run `pnpm build` — should compile without errors.

**Step 4: Commit**

```bash
git add src/Room.tsx
git commit -m "feat: add Close Room button to deactivate room"
```

---

### Task 4: Build the lobby list on the Home page

**Files:**
- Modify: `src/App.tsx`

**Step 1: Add imports and state**

At the top of `App.tsx`, ensure `useEffect` is imported (add it to the existing `useState` import):

```typescript
import { useState, useEffect } from 'react'
```

Inside the `Home` component, add state and types for active rooms:

```typescript
interface ActiveRoom {
  room_code: number
  players: string[]
  created_at: string
}

// Add inside Home(), after existing state declarations:
const [activeRooms, setActiveRooms] = useState<ActiveRoom[]>([])
```

**Step 2: Fetch active rooms on mount**

Add a `useEffect` to fetch rooms and subscribe to realtime changes:

```typescript
useEffect(() => {
  const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()

  const fetchRooms = async () => {
    const { data } = await supabase
      .from('rooms')
      .select('room_code, players, created_at')
      .eq('is_active', true)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
    if (data) setActiveRooms(data)
  }

  fetchRooms()

  const channel = supabase
    .channel('lobby-rooms')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rooms' },
      () => { fetchRooms() }
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [])
```

**Step 3: Add time-ago helper**

Add this helper function above the `Home` component (or inside it):

```typescript
function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}
```

**Step 4: Render the lobby list**

After the Create/Join buttons section and the error message, add the lobby UI. Place it right before the closing `</div>` of the max-w-md container:

```tsx
{activeRooms.length > 0 && (
  <div className="w-full mt-8">
    <h2 className="text-neutral-400 text-xs font-bold uppercase mb-3 tracking-wider">Active Rooms</h2>
    <div className="space-y-2">
      {activeRooms.map(room => (
        <button
          key={room.room_code}
          onClick={() => setRoomCode(room.room_code)}
          className="w-full text-left px-4 py-3 bg-neutral-800 rounded-lg active:bg-neutral-700 transition-colors"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-white font-bold tracking-widest">{room.room_code}</span>
            <span className="text-neutral-500 text-xs">{timeAgo(room.created_at)}</span>
          </div>
          <div className="text-neutral-400 text-sm truncate">
            {room.players.length > 0 ? room.players.join(', ') : 'No players yet'}
          </div>
        </button>
      ))}
    </div>
  </div>
)}
```

**Step 5: Verify**

Run `pnpm build` — should compile without errors.

**Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add active rooms lobby to home page"
```

---

### Task 5: Update join-by-code to check active status

**Files:**
- Modify: `src/App.tsx`

**Step 1: Update joinRoom query**

In the `joinRoom` function, update the Supabase query to also check `is_active`. Change the existing select (around line 69-73) from:

```typescript
const { data, error: fetchError } = await supabase
  .from('rooms')
  .select('room_code, created_at')
  .eq('room_code', code)
  .single()
```

To:

```typescript
const { data, error: fetchError } = await supabase
  .from('rooms')
  .select('room_code, created_at, is_active')
  .eq('room_code', code)
  .single()
```

**Step 2: Add is_active check**

After the existing 24-hour expiry check (around line 81-86), replace it with 4-hour check and add active check:

```typescript
if (!data.is_active) {
  setError('Room has been closed.')
  setLoading(false)
  return
}

const created = new Date(data.created_at).getTime()
if (Date.now() - created > 4 * 60 * 60 * 1000) {
  setError('Room has expired.')
  setLoading(false)
  return
}
```

**Step 3: Verify**

Run `pnpm build` — should compile without errors.

**Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: validate room is active when joining by code"
```

---

### Task 6: Final build and manual test

**Step 1: Full build check**

Run: `pnpm build`
Expected: Clean build, no errors.

**Step 2: Manual test checklist**

- [ ] Home page shows active rooms
- [ ] Creating a room makes it appear in lobby
- [ ] Clicking a room card joins it
- [ ] "Close" button in room deactivates it and returns to home
- [ ] Closed room disappears from lobby
- [ ] Join by code rejects closed rooms
- [ ] Rooms older than 4 hours don't appear in lobby

**Step 3: Commit any fixes if needed**
