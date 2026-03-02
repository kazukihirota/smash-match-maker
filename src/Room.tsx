import { useState, useEffect, useCallback } from 'react'
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
import { supabase } from './supabase.ts'

const STORAGE_KEY = 'smash-match-maker-names'

function PlayerName({
  name,
  isWinner,
  isLoser,
  isCreator,
  done,
  onSelect,
}: {
  name: string
  isWinner: boolean
  isLoser: boolean
  isCreator: boolean
  done: boolean
  onSelect: () => void
}) {
  return (
    <span
      onClick={isCreator ? (e) => { e.stopPropagation(); onSelect() } : undefined}
      className={`shrink-0 px-3 py-1 rounded-md transition-all ${
        isCreator ? 'cursor-pointer active:scale-95' : ''
      } ${
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

function SortableMatch({
  match,
  index,
  done,
  onSelectWinner,
  onToggle,
  trackWinner,
  isCreator,
}: {
  match: Match
  index: number
  done: boolean
  onSelectWinner: (player: string) => void
  onToggle: () => void
  trackWinner: boolean
  isCreator: boolean
}) {
  const sortId = match.id ?? `temp-${match.position}`
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortId, disabled: !isCreator })

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
      {trackWinner ? (
        <div className="flex-1 flex items-center justify-center gap-2 font-medium">
          <PlayerName
            name={match.player1}
            isWinner={match.winner === match.player1}
            isLoser={!!match.winner && match.winner !== match.player1}
            isCreator={isCreator}
            done={done}
            onSelect={() => onSelectWinner(match.player1)}
          />
          <span className={`font-bold ${done ? 'text-neutral-500' : 'text-amber-500'}`}>VS</span>
          <PlayerName
            name={match.player2}
            isWinner={match.winner === match.player2}
            isLoser={!!match.winner && match.winner !== match.player2}
            isCreator={isCreator}
            done={done}
            onSelect={() => onSelectWinner(match.player2)}
          />
        </div>
      ) : (
        <div
          onClick={isCreator ? onToggle : undefined}
          className={`flex-1 flex items-center justify-center gap-3 font-medium ${isCreator ? 'cursor-pointer' : ''} ${done ? 'line-through text-neutral-500' : 'text-white'}`}
        >
          <span className="px-3 py-1">{match.player1}</span>
          <span className={`font-bold ${done ? 'text-neutral-500' : 'text-amber-500'}`}>VS</span>
          <span className="px-3 py-1">{match.player2}</span>
        </div>
      )}
    </div>
  )
}

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
  const [trackWinner, setTrackWinner] = useState(false)
  const [loading, setLoading] = useState(true)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  const syncPlayers = async (players: string[]) => {
    if (!isCreator || !creatorToken) return
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
    await fetchMatches()
    setLoading(false)
  }, [roomCode, onLeave, fetchMatches])

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

  // Realtime: subscribe to matches table for match changes (viewers only —
  // the creator already has correct state from optimistic updates)
  useEffect(() => {
    if (isCreator) return
    const channel = supabase
      .channel(`room-matches-${roomCode}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `room_code=eq.${roomCode}`,
        },
        () => {
          fetchMatches()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomCode, isCreator, fetchMatches])

  useEffect(() => {
    if (isCreator) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(names))
    }
  }, [names, isCreator])

  const addName = () => {
    const trimmed = newName.trim()
    if (trimmed && !names.includes(trimmed)) {
      const updated = [...names, trimmed]
      setNames(updated)
      setNewName('')
      syncPlayers(updated)
    }
  }

  const removeName = async (nameToRemove: string) => {
    const updated = names.filter(name => name !== nameToRemove)
    setNames(updated)
    setMatches([])
    syncPlayers(updated)
    if (isCreator) {
      await supabase.from('matches').delete().eq('room_code', roomCode)
    }
  }

  const clearAll = async () => {
    if (confirm('Clear all players?')) {
      setNames([])
      setMatches([])
      syncPlayers([])
      if (isCreator) {
        await supabase.from('matches').delete().eq('room_code', roomCode)
      }
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
    }))

    const { data } = await supabase.from('matches').insert(rows).select()
    if (data) {
      setMatches(prev => [...prev, ...(data as Match[])])
    }
  }

  const toggleMatch = async (id: number) => {
    const match = matches.find(m => m.id === id)
    if (!match) return
    const newCompleted = !match.completed
    setMatches(prev => prev.map(m => m.id === id ? { ...m, completed: newCompleted } : m))
    await supabase.from('matches').update({ completed: newCompleted }).eq('id', id)
  }

  const selectWinner = async (id: number, player: string) => {
    const match = matches.find(m => m.id === id)
    if (!match) return
    // Tapping the current winner deselects and uncompletes
    const newWinner = match.winner === player ? null : player
    const newCompleted = newWinner !== null
    setMatches(prev => prev.map(m => m.id === id ? { ...m, winner: newWinner, completed: newCompleted } : m))
    await supabase.from('matches').update({ winner: newWinner, completed: newCompleted }).eq('id', id)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const current = matches.filter(m => (m.round ?? 1) === currentRound)
      const rest = matches.filter(m => (m.round ?? 1) !== currentRound)
      const oldIndex = current.findIndex(m => m.id === active.id)
      const newIndex = current.findIndex(m => m.id === over.id)
      const reordered = arrayMove(current, oldIndex, newIndex)
      const updated = [...rest, ...reordered]
      setMatches(updated)

      // Update position for each reordered match
      const updates = reordered.map((m, idx) => (
        supabase.from('matches').update({ position: idx }).eq('id', m.id!)
      ))
      await Promise.all(updates)
    }
  }

  const currentRound = matches.length > 0 ? Math.max(...matches.map(m => m.round ?? 1)) : 0
  const currentMatches = matches.filter(m => (m.round ?? 1) === currentRound)
  const pastRounds = [...new Set(matches.map(m => m.round ?? 1))]
    .filter(r => r !== currentRound)
    .sort((a, b) => b - a)
  const completedCount = currentMatches.filter(m => m.completed).length
  const totalMatches = names.length * (names.length - 1) / 2
  // Viewers see winner mode when any current-round match has a winner
  const effectiveTrackWinner = trackWinner || (!isCreator && currentMatches.some(m => m.winner))

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

        {/* Current Round */}
        {currentMatches.length > 0 && (
          <div className="bg-neutral-800 rounded-lg overflow-hidden mb-4">
            <div className="flex items-center justify-between px-4 py-3 bg-neutral-700">
              <span className="text-white font-bold uppercase text-sm">
                Round {currentRound} ({completedCount}/{currentMatches.length})
              </span>
              {isCreator && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-neutral-300 text-xs uppercase">Track Winner</span>
                  <div
                    onClick={() => setTrackWinner(prev => !prev)}
                    className={`w-9 h-5 rounded-full transition-colors relative ${trackWinner ? 'bg-green-600' : 'bg-neutral-600'}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${trackWinner ? 'translate-x-4' : ''}`} />
                  </div>
                </label>
              )}
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={currentMatches.map(m => m.id ?? `temp-${m.position}`)} strategy={verticalListSortingStrategy}>
                <div className="p-2">
                  {currentMatches.map((match, idx) => (
                    <SortableMatch
                      key={match.id ?? `temp-${match.position}`}
                      match={match}
                      index={idx}
                      done={match.completed}
                      onSelectWinner={(player) => selectWinner(match.id!, player)}
                      onToggle={() => toggleMatch(match.id!)}
                      trackWinner={effectiveTrackWinner}
                      isCreator={isCreator}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
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
                  <SortableMatch
                    key={match.id ?? `temp-${match.position}`}
                    match={match}
                    index={idx}
                    done={match.completed}
                    onSelectWinner={() => {}}
                    onToggle={() => {}}
                    trackWinner={!!match.winner}
                    isCreator={false}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
