# Scoreboard Design

## Overview

Global Elo-based scoreboard computed from all historical match data across rooms. Displayed as a separate page with ranked leaderboard.

## Elo System

- **Starting Elo:** 1000
- **K-factor:** 32
- **Formula:** Standard Elo
  - Expected score: `1 / (1 + 10^((opponentElo - playerElo) / 400))`
  - New rating: `oldRating + K * (actualScore - expectedScore)`
- Beating a stronger player yields more points; losing to a weaker one costs more

## Data Model

New `player_scores` table:
- `player_name` (text, unique, PK)
- `elo_rating` (int, default 1000)
- `wins` (int, default 0)
- `losses` (int, default 0)

## Recalculation

- Triggered after any winner is set or cleared (`selectWinner`)
- Fetches all completed matches globally, ordered by `id` (chronological)
- Replays Elo from scratch: every player starts at 1000, iterate matches, adjust ratings
- Upserts final ratings + win/loss counts into `player_scores`
- Guarantees consistency even when winners are toggled off

## Scoreboard Page

- Separate view accessible from home page
- Ranked table: position, player name (with default character avatar), Elo rating, W-L record
- Sorted by Elo descending

## Tech Decisions

- Client-side Elo computation + DB persistence via upsert
- No edge functions or DB triggers
- Supabase migration for new table
- RLS: public read/write (consistent with existing tables)
