# Monthly Score Reset — Design Spec

## Goal

Add a monthly Elo score view to the Scoreboard so that scores automatically reset at the beginning of each month, while preserving all-time historical data. Users toggle between "All-time" and "This month" views.

## Approach

- **All-time**: continue reading pre-computed scores from the `player_scores` table (no change)
- **This month**: compute scores client-side by filtering matches on `created_at` and running Elo from scratch (everyone starts at 1000 each month)

No database schema changes required.

## Changes

### 1. `src/elo.ts` — Extract pure computation

Extract the Elo computation loop into a new exported function:

```ts
export function computeScoresFromMatches(
  matches: { player1: string; player2: string; winner: string }[]
): { elo: Record<string, number>; wins: Record<string, number>; losses: Record<string, number> }
```

- Takes an array of matches (already ordered chronologically)
- Returns computed elo, wins, and losses maps
- `recalculateScores()` calls this internally (no behavior change)

### 2. `src/Scoreboard.tsx` — Tab toggle and monthly filtering

**Data fetching:**
- Include `created_at` in the matches select query
- **All-time tab**: uses existing `player_scores` table query (unchanged)
- **This month tab**: filters fetched matches to current month (`created_at >= first day of current month, local timezone`), then calls `computeScoresFromMatches()` to get monthly elo/wins/losses

Month boundary uses the client's local timezone so the cutoff feels intuitive to the user.

**UI:**
- Add a two-segment toggle below the header: "All-time" | "This month"
- Default active tab: "This month"
- Ranking list and head-to-head breakdown both respond to the active tab
- When "This month" is selected but no matches exist yet, show "No matches this month."

**Styling:**
- Toggle uses the existing amber/neutral color scheme
- Active tab: amber-500 background, dark text
- Inactive tab: neutral-700 background, neutral-300 text

## Files Modified

| File | Change |
|------|--------|
| `src/elo.ts` | Extract `computeScoresFromMatches()`, refactor `recalculateScores()` to use it |
| `src/Scoreboard.tsx` | Add tab state, monthly match filtering, compute monthly scores client-side |

## Out of Scope

- Viewing arbitrary past months (only current month vs all-time)
- Storing monthly scores in the database
- Any database migrations
