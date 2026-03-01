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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Room({ roomCode, role, creatorToken: _creatorToken, onLeave }: RoomProps) {
  const isCreator = role === 'creator'
  const [names, setNames] = useState<string[]>([])
  const [newName, setNewName] = useState('')
  const [matches, setMatches] = useState<Match[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  useEffect(() => {
    if (isCreator) {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        try { setNames(JSON.parse(saved)) } catch { /* ignore */ }
      }
    }
  }, [isCreator])

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
