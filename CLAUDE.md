# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `pnpm dev`
- **Build:** `pnpm build` (runs `tsc -b && vite build`)
- **Lint:** `pnpm lint`
- **Preview production build:** `pnpm preview`

## Architecture

Single-page React + TypeScript app built with Vite. Styled with Tailwind CSS v4 (via `@tailwindcss/postcss`).

The entire app lives in `src/App.tsx` — a single component that handles player management and match generation. Player names are persisted to `localStorage`. Match generation creates all unique pairs then reorders them to minimize consecutive matches for the same player.

No routing, no state management library, no backend. Designed as a mobile-friendly tool (viewport locked, tap highlight disabled).
