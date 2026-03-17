import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { Character } from './types.ts'
import { supabase } from './supabase.ts'
import { computeScoresFromMatches } from './elo.ts'

const CHARACTER_IMAGE_BASE = 'https://www.smashbros.com/assets_v2/img/fighter/thumb_a'

type Tab = 'month' | 'alltime'

interface PlayerScore {
  player_name: string
  elo_rating: number
  wins: number
  losses: number
}

interface PlayerDefault {
  player_name: string
  default_character_id: number | null
}

interface HeadToHead {
  opponent: string
  wins: number
  losses: number
}

interface MatchRow {
  player1: string
  player2: string
  winner: string
  created_at: string
}

function buildHeadToHead(matches: MatchRow[]): Record<string, HeadToHead[]> {
  const h2h: Record<string, Record<string, { wins: number; losses: number }>> = {}
  for (const m of matches) {
    const winner = m.winner
    const loser = winner === m.player1 ? m.player2 : m.player1

    if (!h2h[winner]) h2h[winner] = {}
    if (!h2h[winner][loser]) h2h[winner][loser] = { wins: 0, losses: 0 }
    h2h[winner][loser].wins++

    if (!h2h[loser]) h2h[loser] = {}
    if (!h2h[loser][winner]) h2h[loser][winner] = { wins: 0, losses: 0 }
    h2h[loser][winner].losses++
  }

  const result: Record<string, HeadToHead[]> = {}
  for (const [player, opponents] of Object.entries(h2h)) {
    result[player] = Object.entries(opponents)
      .map(([opponent, record]) => ({ opponent, ...record }))
      .sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses))
  }
  return result
}

function getMonthStart(): string {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return start.toISOString()
}

export function Scoreboard() {
  const [tab, setTab] = useState<Tab>('month')
  const [allTimeScores, setAllTimeScores] = useState<PlayerScore[]>([])
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [defaults, setDefaults] = useState<PlayerDefault[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: scoreData }, { data: chars }, { data: playerDefaults }, { data: matchData }] = await Promise.all([
        supabase
          .from('player_scores')
          .select('player_name, elo_rating, wins, losses')
          .order('elo_rating', { ascending: false }),
        supabase.from('characters').select('*').order('fighter_number'),
        supabase.from('player_defaults').select('player_name, default_character_id'),
        supabase
          .from('matches')
          .select('player1, player2, winner, created_at')
          .eq('completed', true)
          .not('winner', 'is', null)
          .order('id', { ascending: true }),
      ])

      if (scoreData) setAllTimeScores(scoreData as PlayerScore[])
      if (chars) setCharacters(chars as Character[])
      if (playerDefaults) setDefaults(playerDefaults as PlayerDefault[])
      if (matchData) setMatches(matchData as MatchRow[])

      setLoading(false)
    }
    load()
  }, [])

  const monthStart = useMemo(() => getMonthStart(), [])
  const monthlyMatches = useMemo(
    () => matches.filter(m => m.created_at >= monthStart),
    [matches, monthStart]
  )

  const monthlyScores = useMemo(() => {
    if (monthlyMatches.length === 0) return []
    const { elo, wins, losses } = computeScoresFromMatches(monthlyMatches)
    return Object.keys(elo)
      .map(player_name => ({
        player_name,
        elo_rating: elo[player_name],
        wins: wins[player_name],
        losses: losses[player_name],
      }))
      .sort((a, b) => b.elo_rating - a.elo_rating)
  }, [monthlyMatches])

  const activeMatches = tab === 'month' ? monthlyMatches : matches
  const activeScores = tab === 'month' ? monthlyScores : allTimeScores
  const headToHead = useMemo(() => buildHeadToHead(activeMatches), [activeMatches])

  const charMap = new Map(characters.map(c => [c.id, c]))
  const defaultMap = new Map(defaults.map(d => [d.player_name, d.default_character_id]))

  if (loading) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center">
        <p className="text-neutral-400">Loading scoreboard...</p>
      </div>
    )
  }

  function rankColor(position: number) {
    if (position === 1) return 'text-yellow-400'
    if (position === 2) return 'text-neutral-300'
    if (position === 3) return 'text-amber-600'
    return 'text-neutral-500'
  }

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6 pt-4">
          <Link to="/" className="text-amber-500 text-sm font-medium">
            &larr; Home
          </Link>
          <h1 className="text-xl font-bold">
            <span className="text-white">Smash</span>
            <span className="text-amber-500 italic"> Rankings</span>
          </h1>
          <div className="w-14" />
        </div>

        <div className="flex rounded-lg overflow-hidden mb-4">
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              tab === 'month'
                ? 'bg-amber-500 text-neutral-900'
                : 'bg-neutral-700 text-neutral-300'
            }`}
            onClick={() => setTab('month')}
          >
            This Month
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              tab === 'alltime'
                ? 'bg-amber-500 text-neutral-900'
                : 'bg-neutral-700 text-neutral-300'
            }`}
            onClick={() => setTab('alltime')}
          >
            All-time
          </button>
        </div>

        {activeScores.length === 0 ? (
          <p className="text-neutral-400 text-center">
            {tab === 'month' ? 'No matches this month.' : 'No matches played yet.'}
          </p>
        ) : (
          <div className="bg-neutral-800 rounded-lg overflow-hidden">
            <div className="divide-y divide-neutral-700/50">
              {activeScores.map((player, index) => {
                const position = index + 1
                const charId = defaultMap.get(player.player_name)
                const char = charId ? charMap.get(charId) : null
                const isExpanded = expanded === player.player_name
                const records = headToHead[player.player_name] ?? []

                return (
                  <div key={player.player_name}>
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-neutral-700/50 select-none"
                      onClick={() => setExpanded(isExpanded ? null : player.player_name)}
                    >
                      <span className={`w-6 text-center font-bold ${rankColor(position)}`}>
                        {position}
                      </span>

                      {char ? (
                        <img
                          src={`${CHARACTER_IMAGE_BASE}/${char.image_slug}.png`}
                          alt={char.name}
                          title={char.name}
                          className="w-8 h-8 rounded-full object-cover bg-neutral-600"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-neutral-600 flex items-center justify-center text-neutral-400 text-xs font-bold">
                          {player.player_name.charAt(0).toUpperCase()}
                        </div>
                      )}

                      <span className="text-white font-medium flex-1">{player.player_name}</span>

                      <span className="text-neutral-400 text-sm">
                        {player.wins}W-{player.losses}L
                      </span>

                      <span className={`font-bold text-sm min-w-[3rem] text-right ${player.elo_rating >= 1000 ? 'text-green-400' : 'text-red-400'}`}>
                        {player.elo_rating}
                      </span>
                    </div>

                    {isExpanded && records.length > 0 && (
                      <div className="bg-neutral-900/50 px-4 py-2">
                        {records.map(r => (
                          <div key={r.opponent} className="flex items-center gap-3 py-1.5">
                            <span className="text-neutral-400 text-sm flex-1">vs {r.opponent}</span>
                            <span className="text-green-400 text-sm font-medium">{r.wins}W</span>
                            <span className="text-red-400 text-sm font-medium">{r.losses}L</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
