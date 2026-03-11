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

interface PlayerDefault {
  player_name: string
  default_character_id: number | null
}

export function Scoreboard() {
  const [scores, setScores] = useState<PlayerScore[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [defaults, setDefaults] = useState<PlayerDefault[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: scoreData }, { data: chars }, { data: playerDefaults }] = await Promise.all([
        supabase
          .from('player_scores')
          .select('player_name, elo_rating, wins, losses')
          .order('elo_rating', { ascending: false }),
        supabase.from('characters').select('*').order('fighter_number'),
        supabase.from('player_defaults').select('player_name, default_character_id'),
      ])

      if (scoreData) setScores(scoreData as PlayerScore[])
      if (chars) setCharacters(chars as Character[])
      if (playerDefaults) setDefaults(playerDefaults as PlayerDefault[])
      setLoading(false)
    }
    load()
  }, [])

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

        {scores.length === 0 ? (
          <p className="text-neutral-400 text-center">No matches played yet.</p>
        ) : (
          <div className="bg-neutral-800 rounded-lg overflow-hidden">
            <div className="divide-y divide-neutral-700/50">
              {scores.map((player, index) => {
                const position = index + 1
                const charId = defaultMap.get(player.player_name)
                const char = charId ? charMap.get(charId) : null

                return (
                  <div key={player.player_name} className="flex items-center gap-3 px-4 py-3">
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
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
