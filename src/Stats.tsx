import { useState, useEffect } from 'react'
import type { Character } from './types.ts'
import { supabase } from './supabase.ts'

const CHARACTER_IMAGE_BASE = 'https://www.smashbros.com/assets_v2/img/fighter/thumb_a'

interface WinRecord {
  winner: string
  character_id: number | null
  opponent: string
  count: number
}

export function Stats() {
  const [records, setRecords] = useState<WinRecord[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: matches }, { data: chars }] = await Promise.all([
        supabase
          .from('matches')
          .select('player1, player2, winner, player1_character_id, player2_character_id')
          .eq('completed', true)
          .not('winner', 'is', null),
        supabase.from('characters').select('*').order('fighter_number'),
      ])

      if (chars) setCharacters(chars as Character[])

      if (matches) {
        const map = new Map<string, WinRecord>()
        for (const m of matches) {
          if (!m.winner) continue
          const isP1 = m.winner === m.player1
          const charId = isP1 ? m.player1_character_id : m.player2_character_id
          const opponent = isP1 ? m.player2 : m.player1
          const key = `${m.winner}|${charId ?? 'none'}|${opponent}`
          const existing = map.get(key)
          if (existing) {
            existing.count++
          } else {
            map.set(key, { winner: m.winner, character_id: charId, opponent, count: 1 })
          }
        }
        const sorted = [...map.values()].sort((a, b) => {
          if (a.winner !== b.winner) return a.winner.localeCompare(b.winner)
          if (b.count !== a.count) return b.count - a.count
          return a.opponent.localeCompare(b.opponent)
        })
        setRecords(sorted)
      }
      setLoading(false)
    }
    load()
  }, [])

  const charMap = new Map(characters.map(c => [c.id, c]))

  const players = [...new Set(records.map(r => r.winner))].sort()
  const totalWins = new Map<string, number>()
  for (const r of records) {
    totalWins.set(r.winner, (totalWins.get(r.winner) ?? 0) + r.count)
  }
  players.sort((a, b) => (totalWins.get(b) ?? 0) - (totalWins.get(a) ?? 0))

  if (loading) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center">
        <p className="text-neutral-400">Loading stats...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6 pt-4">
          <h1 className="text-xl font-bold">
            <span className="text-white">Smash</span>
            <span className="text-amber-500 italic"> Stats</span>
          </h1>
        </div>

        {records.length === 0 ? (
          <p className="text-neutral-400 text-center">No completed matches yet.</p>
        ) : (
          players.map(player => {
            const playerRecords = records.filter(r => r.winner === player)
            const wins = totalWins.get(player) ?? 0
            return (
              <div key={player} className="bg-neutral-800 rounded-lg overflow-hidden mb-4">
                <div className="px-4 py-3 bg-neutral-700 flex justify-between items-center">
                  <span className="text-white font-bold">{player}</span>
                  <span className="text-amber-500 text-sm font-bold">{wins} win{wins !== 1 && 's'}</span>
                </div>
                <div className="divide-y divide-neutral-700/50">
                  {playerRecords.map((r, i) => {
                    const char = r.character_id ? charMap.get(r.character_id) : null
                    return (
                      <div key={i} className="flex items-center gap-3 px-4 py-2">
                        {char ? (
                          <img
                            src={`${CHARACTER_IMAGE_BASE}/${char.image_slug}.png`}
                            alt={char.name}
                            title={char.name}
                            className="w-8 h-8 rounded-full object-cover bg-neutral-600"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-neutral-600 flex items-center justify-center text-neutral-400 text-xs">
                            ?
                          </div>
                        )}
                        <span className="text-neutral-300 flex-1">vs {r.opponent}</span>
                        <span className="text-green-400 font-bold text-sm">×{r.count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
