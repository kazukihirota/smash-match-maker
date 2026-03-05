import { useState, useEffect, useCallback } from 'react'
import type { Match, Character, PlayerDefault } from './types.ts'
import { supabase } from './supabase.ts'

const STORAGE_KEY = 'smash-match-maker-names'
const CHARACTER_IMAGE_BASE = 'https://www.smashbros.com/assets_v2/img/fighter/thumb_a'

function CharacterBadge({
  character,
  onClick,
}: {
  character: Character | null
  onClick?: () => void
}) {
  if (character) {
    return (
      <img
        src={`${CHARACTER_IMAGE_BASE}/${character.image_slug}.png`}
        alt={character.name}
        title={character.name}
        onClick={onClick}
        className="w-8 h-8 rounded-full object-cover bg-neutral-600 cursor-pointer active:scale-90"
      />
    )
  }
  return (
    <button
      onClick={onClick}
      className="w-8 h-8 rounded-full bg-neutral-600 text-neutral-400 text-xs flex items-center justify-center cursor-pointer active:scale-90"
      title="Select character"
    >
      ?
    </button>
  )
}

function CharacterPicker({
  characters,
  onSelect,
  onClose,
}: {
  characters: Character[]
  onSelect: (character: Character) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const filtered = search
    ? characters.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : characters

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-neutral-800 rounded-t-2xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-neutral-700 flex items-center justify-between">
          <span className="text-white font-bold uppercase text-sm">Select Character</span>
          <button onClick={onClose} className="text-neutral-400 text-lg">✕</button>
        </div>
        <div className="px-4 py-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 text-white placeholder-neutral-400 text-sm focus:outline-none focus:border-neutral-500"
          />
        </div>
        <div className="overflow-y-auto p-2 grid grid-cols-5 gap-2">
          {filtered.map(c => (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-neutral-700 active:bg-neutral-600 transition-colors"
            >
              <img
                src={`${CHARACTER_IMAGE_BASE}/${c.image_slug}.png`}
                alt={c.name}
                className="w-12 h-12 rounded-lg object-cover bg-neutral-600"
              />
              <span className="text-neutral-300 text-[10px] leading-tight text-center truncate w-full">
                {c.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function PlayerName({
  name,
  isWinner,
  isLoser,
  done,
  onSelect,
}: {
  name: string
  isWinner: boolean
  isLoser: boolean
  done: boolean
  onSelect: () => void
}) {
  return (
    <span
      onClick={(e) => { e.stopPropagation(); onSelect() }}
      className={`shrink-0 px-3 py-1 rounded-md transition-all cursor-pointer active:scale-95 ${
        isWinner
          ? 'bg-green-600/30 text-green-400 font-bold'
          : isLoser
            ? 'text-neutral-500 line-through'
            : done
              ? 'text-neutral-500'
              : 'text-white'
      }`}
    >
      {name}
    </span>
  )
}

function MatchRow({
  match,
  index,
  done,
  onSelectWinner,
  characters,
  onPickCharacter,
}: {
  match: Match
  index: number
  done: boolean
  onSelectWinner: (player: string) => void
  characters: Character[]
  onPickCharacter: (matchId: number, playerSlot: 'player1' | 'player2') => void
}) {
  const p1Char = match.player1_character_id
    ? characters.find(c => c.id === match.player1_character_id) ?? null
    : null
  const p2Char = match.player2_character_id
    ? characters.find(c => c.id === match.player2_character_id) ?? null
    : null

  return (
    <div
      className={`flex items-center rounded-lg px-4 py-3 mb-2 last:mb-0 select-none transition-all ${done ? 'bg-neutral-800/50 opacity-40' : 'bg-neutral-700/50'}`}
    >
      <span className="text-neutral-500 text-sm w-8">{index + 1}.</span>
      <div className="flex-1 flex items-center justify-center gap-2 font-medium">
        <CharacterBadge
          character={p1Char}
          onClick={() => match.id && onPickCharacter(match.id, 'player1')}
        />
        <PlayerName
          name={match.player1}
          isWinner={match.winner === match.player1}
          isLoser={!!match.winner && match.winner !== match.player1}
          done={done}
          onSelect={() => onSelectWinner(match.player1)}
        />
        <span className={`font-bold ${done ? 'text-neutral-500' : 'text-amber-500'}`}>VS</span>
        <PlayerName
          name={match.player2}
          isWinner={match.winner === match.player2}
          isLoser={!!match.winner && match.winner !== match.player2}
          done={done}
          onSelect={() => onSelectWinner(match.player2)}
        />
        <CharacterBadge
          character={p2Char}
          onClick={() => match.id && onPickCharacter(match.id, 'player2')}
        />
      </div>
    </div>
  )
}

interface RoomProps {
  roomCode: number
  onLeave: () => void
}

export function Room({ roomCode, onLeave }: RoomProps) {
  const [names, setNames] = useState<string[]>([])
  const [newName, setNewName] = useState('')
  const [matches, setMatches] = useState<Match[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [playerDefaults, setPlayerDefaults] = useState<Record<string, number | null>>({})
  const [playersOpen, setPlayersOpen] = useState(true)
  const [loading, setLoading] = useState(true)
  const [pickerTarget, setPickerTarget] = useState<
    | { type: 'match'; matchId: number; playerSlot: 'player1' | 'player2' }
    | { type: 'default'; playerName: string }
    | null
  >(null)

  const syncPlayers = async (players: string[]) => {
    await supabase
      .from('rooms')
      .update({ players })
      .eq('room_code', roomCode)
  }

  const fetchMatches = useCallback(async () => {
    const { data } = await supabase
      .from('matches')
      .select('*')
      .eq('room_code', roomCode)
      .order('round')
      .order('position')
    if (data) {
      setMatches(data as Match[])
    }
  }, [roomCode])

  const fetchPlayerDefaults = useCallback(async () => {
    const { data } = await supabase
      .from('player_defaults')
      .select('*')
      .order('id')
    const map: Record<string, number | null> = {}
    if (data) {
      for (const d of data as PlayerDefault[]) {
        map[d.player_name] = d.default_character_id
      }
    }
    setPlayerDefaults(map)
  }, [])

  const refreshRoom = useCallback(async () => {
    const { data } = await supabase
      .from('rooms')
      .select('players')
      .eq('room_code', roomCode)
      .single()
    if (data) {
      setNames(data.players)
    } else {
      onLeave()
      return
    }
    await Promise.all([fetchMatches(), fetchPlayerDefaults()])
    setLoading(false)
  }, [roomCode, onLeave, fetchMatches, fetchPlayerDefaults])

  // Auto-collapse players when matches are loaded
  useEffect(() => {
    if (!loading && matches.length > 0) {
      setPlayersOpen(false)
    }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch characters once
  useEffect(() => {
    supabase
      .from('characters')
      .select('*')
      .order('fighter_number')
      .then(({ data }) => {
        if (data) setCharacters(data as Character[])
      })
  }, [])

  // Initial load
  useEffect(() => {
    refreshRoom()
  }, [refreshRoom])

  // Re-fetch data when returning from background (mobile lock screen, tab switch)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshRoom()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refreshRoom])

  // Realtime: subscribe to rooms for player changes
  useEffect(() => {
    const channel = supabase
      .channel(`room-players-${roomCode}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `room_code=eq.${roomCode}`,
        },
        (payload) => {
          const newData = payload.new as { players: string[] }
          setNames(newData.players)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomCode])

  // Realtime: subscribe to matches table for match changes
  useEffect(() => {
    const channel = supabase
      .channel(`room-matches-${roomCode}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'matches',
          filter: `room_code=eq.${roomCode}`,
        },
        (payload) => {
          const newMatch = payload.new as Match
          setMatches(prev => {
            if (prev.some(m => m.id === newMatch.id)) return prev
            return [...prev, newMatch]
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `room_code=eq.${roomCode}`,
        },
        (payload) => {
          const updated = payload.new as Match
          setMatches(prev => prev.map(m => m.id === updated.id ? updated : m))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'matches',
          filter: `room_code=eq.${roomCode}`,
        },
        (payload) => {
          const deleted = payload.old as { id: number }
          setMatches(prev => prev.filter(m => m.id !== deleted.id))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomCode])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(names))
  }, [names])

  const addName = async () => {
    const trimmed = newName.trim()
    if (trimmed && !names.includes(trimmed)) {
      const updated = [...names, trimmed]
      setNames(updated)
      setNewName('')
      syncPlayers(updated)
      if (!playerDefaults[trimmed]) {
        setPlayerDefaults(prev => ({ ...prev, [trimmed]: null }))
        await supabase
          .from('player_defaults')
          .upsert({ player_name: trimmed }, { onConflict: 'player_name' })
      }
    }
  }

  const removeName = async (nameToRemove: string) => {
    const updated = names.filter(name => name !== nameToRemove)
    setNames(updated)
    setMatches([])
    syncPlayers(updated)
    await supabase.from('matches').delete().eq('room_code', roomCode)
  }

  const clearAll = async () => {
    if (confirm('Clear all players?')) {
      setNames([])
      setMatches([])
      syncPlayers([])
      await supabase.from('matches').delete().eq('room_code', roomCode)
    }
  }

  const generateMatches = async () => {
    const nextRound = matches.length > 0
      ? Math.max(...matches.map(m => m.round ?? 1)) + 1
      : 1

    const allPairs: { player1: string; player2: string }[] = []
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        allPairs.push({ player1: names[i], player2: names[j] })
      }
    }

    const shuffled = allPairs.sort(() => Math.random() - 0.5)
    const result: typeof allPairs = []
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

    const rows = result.map((pair, idx) => ({
      room_code: roomCode,
      round: nextRound,
      player1: pair.player1,
      player2: pair.player2,
      completed: false,
      winner: null,
      position: idx,
      player1_character_id: playerDefaults[pair.player1] ?? null,
      player2_character_id: playerDefaults[pair.player2] ?? null,
    }))

    const { data } = await supabase.from('matches').insert(rows).select()
    if (data) {
      setMatches(prev => [...prev, ...(data as Match[])])
      setPlayersOpen(false)
    }
  }

  const selectWinner = async (id: number, player: string) => {
    const match = matches.find(m => m.id === id)
    if (!match) return
    const newWinner = match.winner === player ? null : player
    const newCompleted = newWinner !== null
    setMatches(prev => prev.map(m => m.id === id ? { ...m, winner: newWinner, completed: newCompleted } : m))
    await supabase.from('matches').update({ winner: newWinner, completed: newCompleted }).eq('id', id)
  }

  const selectCharacter = async (character: Character) => {
    if (!pickerTarget) return
    if (pickerTarget.type === 'match') {
      const { matchId, playerSlot } = pickerTarget
      const columnKey = playerSlot === 'player1' ? 'player1_character_id' : 'player2_character_id'
      setMatches(prev => prev.map(m => m.id === matchId ? { ...m, [columnKey]: character.id } : m))
      setPickerTarget(null)
      await supabase.from('matches').update({ [columnKey]: character.id }).eq('id', matchId)
    } else {
      const { playerName } = pickerTarget
      setPlayerDefaults(prev => ({ ...prev, [playerName]: character.id }))
      setPickerTarget(null)
      await supabase
        .from('player_defaults')
        .upsert(
          { player_name: playerName, default_character_id: character.id },
          { onConflict: 'player_name' }
        )
    }
  }

  const currentRound = matches.length > 0 ? Math.max(...matches.map(m => m.round ?? 1)) : 0
  const currentMatches = matches.filter(m => (m.round ?? 1) === currentRound)
  const pastRounds = [...new Set(matches.map(m => m.round ?? 1))]
    .filter(r => r !== currentRound)
    .sort((a, b) => b - a)
  const completedCount = currentMatches.filter(m => m.completed).length
  const totalMatches = names.length * (names.length - 1) / 2

  if (loading) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center">
        <p className="text-neutral-400">Loading room...</p>
      </div>
    )
  }

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

        {/* Add Name */}
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

        {/* Players List */}
        <div className="bg-neutral-800 rounded-lg mb-4 overflow-hidden">
          <div
            className="flex justify-between items-center px-4 py-3 bg-neutral-700 cursor-pointer select-none"
            onClick={() => setPlayersOpen(prev => !prev)}
          >
            <span className="text-white font-bold uppercase text-sm">
              <span className="text-neutral-400 mr-2 inline-block transition-transform" style={{ transform: playersOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</span>
              Players ({names.length})
            </span>
            {names.length > 0 && (
              <button onClick={(e) => { e.stopPropagation(); clearAll() }} className="text-sm text-red-400 hover:text-red-300">
                Clear
              </button>
            )}
          </div>
          {!playersOpen && names.length > 0 && (
            <div className="px-4 py-2 flex gap-1 flex-wrap">
              {names.map(name => {
                const charId = playerDefaults[name]
                const char = charId ? characters.find(c => c.id === charId) : null
                return char ? (
                  <img
                    key={name}
                    src={`${CHARACTER_IMAGE_BASE}/${char.image_slug}.png`}
                    alt={name}
                    title={`${name} — ${char.name}`}
                    className="w-8 h-8 rounded-full object-cover bg-neutral-600"
                  />
                ) : (
                  <div
                    key={name}
                    title={name}
                    className="w-8 h-8 rounded-full bg-neutral-600 flex items-center justify-center text-neutral-400 text-[10px]"
                  >
                    {name[0]}
                  </div>
                )
              })}
            </div>
          )}
          {playersOpen && <div className="p-4">
            {names.length === 0 ? (
              <p className="text-neutral-400 text-center py-2">
                Add at least 2 players to begin matchmaking.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {names.map((name) => {
                  const defaultCharId = playerDefaults[name]
                  const defaultChar = defaultCharId
                    ? characters.find(c => c.id === defaultCharId) ?? null
                    : null
                  return (
                    <div
                      key={name}
                      className="flex items-center gap-3 px-3 py-2 bg-neutral-700 rounded-lg"
                    >
                      {defaultChar ? (
                        <img
                          src={`${CHARACTER_IMAGE_BASE}/${defaultChar.image_slug}.png`}
                          alt={defaultChar.name}
                          onClick={() => setPickerTarget({ type: 'default', playerName: name })}
                          className="w-10 h-10 rounded-lg object-cover bg-neutral-600 cursor-pointer active:scale-90"
                        />
                      ) : (
                        <button
                          onClick={() => setPickerTarget({ type: 'default', playerName: name })}
                          className="w-10 h-10 rounded-lg bg-neutral-600 text-neutral-400 text-xs flex items-center justify-center cursor-pointer active:scale-90 shrink-0"
                        >
                          ?
                        </button>
                      )}
                      <span className="text-white flex-1">{name}</span>
                      {defaultChar && (
                        <span className="text-neutral-400 text-xs">{defaultChar.name}</span>
                      )}
                      <button
                        onClick={() => removeName(name)}
                        className="text-neutral-400 hover:text-white ml-1"
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>}
        </div>

        {/* Generate Button */}
        <button
          onClick={generateMatches}
          disabled={names.length < 2}
          className="w-full py-4 bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 text-white text-xl font-bold uppercase rounded-lg disabled:opacity-50 active:scale-[0.98] transition-transform mb-4 shadow-lg shadow-orange-500/30"
        >
          Generate {totalMatches > 0 ? `${totalMatches} Matches` : 'Matches'}
        </button>

        {/* Current Round */}
        {currentMatches.length > 0 && (
          <div className="bg-neutral-800 rounded-lg overflow-hidden mb-4">
            <div className="flex items-center justify-between px-4 py-3 bg-neutral-700">
              <span className="text-white font-bold uppercase text-sm">
                Round {currentRound} ({completedCount}/{currentMatches.length})
              </span>
            </div>
            <div className="p-2">
              {currentMatches.map((match, idx) => (
                <MatchRow
                  key={match.id ?? `temp-${match.position}`}
                  match={match}
                  index={idx}
                  done={match.completed}
                  onSelectWinner={(player) => selectWinner(match.id!, player)}
                  characters={characters}
                  onPickCharacter={(matchId, playerSlot) => setPickerTarget({ type: 'match', matchId, playerSlot })}
                />
              ))}
            </div>
          </div>
        )}

        {/* Past Rounds */}
        {pastRounds.map(round => {
          const roundMatches = matches.filter(m => (m.round ?? 1) === round)
          const roundCompleted = roundMatches.filter(m => m.completed).length
          return (
            <div key={round} className="bg-neutral-800 rounded-lg overflow-hidden mb-4 opacity-60">
              <div className="px-4 py-3 bg-neutral-700">
                <span className="text-white font-bold uppercase text-sm">
                  Round {round} ({roundCompleted}/{roundMatches.length})
                </span>
              </div>
              <div className="p-2">
                {roundMatches.map((match, idx) => (
                  <MatchRow
                    key={match.id ?? `temp-${match.position}`}
                    match={match}
                    index={idx}
                    done={match.completed}
                    onSelectWinner={() => {}}
                    characters={characters}
                    onPickCharacter={() => {}}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Character Picker Modal */}
      {pickerTarget && (
        <CharacterPicker
          characters={characters}
          onSelect={selectCharacter}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </div>
  )
}
