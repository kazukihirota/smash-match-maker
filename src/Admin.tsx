import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase.ts'
import { recalculateScores } from './elo.ts'
import { toast } from 'sonner'

interface MatchRow {
  id: number
  room_code: number
  round: number
  player1: string
  player2: string
  winner: string | null
  completed: boolean
}

interface PlayerRow {
  player_name: string
  default_character_id: number | null
}

function PlayerManager({ onDataChanged }: { onDataChanged?: () => void }) {
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [loading, setLoading] = useState(true)

  const loadPlayers = async () => {
    const { data } = await supabase
      .from('player_defaults')
      .select('player_name, default_character_id')
      .order('player_name')
    if (data) setPlayers(data)
    setLoading(false)
  }

  useEffect(() => { loadPlayers() }, [])

  const startEdit = (name: string) => {
    setEditing(name)
    setEditValue(name)
  }

  const saveEdit = async (oldName: string) => {
    const newName = editValue.trim()
    if (!newName || newName === oldName) {
      setEditing(null)
      return
    }

    if (players.some(p => p.player_name === newName)) {
      toast.error(`"${newName}" already exists`)
      return
    }

    setEditing(null)

    // Update player_defaults
    await supabase
      .from('player_defaults')
      .update({ player_name: newName })
      .eq('player_name', oldName)

    // Update matches: player1, player2, winner
    await supabase.from('matches').update({ player1: newName }).eq('player1', oldName)
    await supabase.from('matches').update({ player2: newName }).eq('player2', oldName)
    await supabase.from('matches').update({ winner: newName }).eq('winner', oldName)

    // Update player_scores
    await supabase.from('player_scores').update({ player_name: newName }).eq('player_name', oldName)

    // Update rooms.players array
    const { data: rooms } = await supabase.from('rooms').select('room_code, players')
    if (rooms) {
      for (const room of rooms) {
        if (room.players.includes(oldName)) {
          const updated = room.players.map((p: string) => p === oldName ? newName : p)
          await supabase.from('rooms').update({ players: updated }).eq('room_code', room.room_code)
        }
      }
    }

    await recalculateScores()
    loadPlayers()
    onDataChanged?.()
    toast.success(`Renamed "${oldName}" to "${newName}"`)
  }

  const removePlayer = (name: string) => {
    toast(`Remove "${name}" and all their matches?`, {
      action: {
        label: 'Remove',
        onClick: async () => {
          await supabase.from('matches').delete().eq('player1', name)
          await supabase.from('matches').delete().eq('player2', name)
          await supabase.from('player_scores').delete().eq('player_name', name)
          await supabase.from('player_defaults').delete().eq('player_name', name)

          const { data: rooms } = await supabase.from('rooms').select('room_code, players')
          if (rooms) {
            for (const room of rooms) {
              if (room.players.includes(name)) {
                const updated = room.players.filter((p: string) => p !== name)
                await supabase.from('rooms').update({ players: updated }).eq('room_code', room.room_code)
              }
            }
          }

          await recalculateScores()
          loadPlayers()
          onDataChanged?.()
          toast.success(`Removed "${name}"`)
        },
      },
    })
  }

  if (loading) return null

  return (
    <div className="mb-6">
      <h2 className="text-neutral-400 text-xs font-bold uppercase mb-3 tracking-wider">Players</h2>
      <div className="bg-neutral-800 rounded-lg overflow-hidden">
        {players.map(player => (
          <div key={player.player_name} className="flex items-center gap-3 px-4 py-3 border-b border-neutral-700/50 last:border-b-0">
            {editing === player.player_name ? (
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit(player.player_name)
                  if (e.key === 'Escape') setEditing(null)
                }}
                onBlur={() => saveEdit(player.player_name)}
                className="flex-1 px-2 py-1 rounded bg-neutral-700 border border-neutral-500 text-white text-sm focus:outline-none"
                autoFocus
              />
            ) : (
              <span
                onClick={() => startEdit(player.player_name)}
                className="flex-1 text-white text-sm cursor-pointer"
              >
                {player.player_name}
              </span>
            )}
            <button
              onClick={() => removePlayer(player.player_name)}
              className="text-red-400 text-sm px-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function AdminPanel() {
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [roomDates, setRoomDates] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [recalculating, setRecalculating] = useState(false)

  const loadMatches = async () => {
    const { data } = await supabase
      .from('matches')
      .select('id, room_code, round, player1, player2, winner, completed')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('room_code', { ascending: false })
      .order('round', { ascending: false })
      .order('id', { ascending: true })
    if (data) setMatches(data)

    // Fetch room created_at times
    const roomCodes = [...new Set(data?.map(m => m.room_code) ?? [])]
    if (roomCodes.length > 0) {
      const { data: roomData } = await supabase
        .from('rooms')
        .select('room_code, created_at')
        .in('room_code', roomCodes)
      if (roomData) {
        const map: Record<number, string> = {}
        for (const r of roomData) map[r.room_code] = r.created_at
        setRoomDates(map)
      }
    }

    setLoading(false)
  }

  useEffect(() => { loadMatches() }, [])

  const handleRecalculate = async () => {
    setRecalculating(true)
    await recalculateScores()
    setRecalculating(false)
    toast.success('ELO scores recalculated')
  }

  const changeWinner = async (matchId: number, newWinner: string) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, winner: newWinner } : m))
    await supabase.from('matches').update({ winner: newWinner, completed: true }).eq('id', matchId)
    toast.success(`Winner set to ${newWinner}`)
  }

  const deleteMatch = (matchId: number) => {
    toast('Delete this match?', {
      action: {
        label: 'Delete',
        onClick: async () => {
          setMatches(prev => prev.filter(m => m.id !== matchId))
          await supabase.from('matches').delete().eq('id', matchId)
          toast.success('Match deleted')
        },
      },
    })
  }

  // Group matches by room_code, then by round
  const grouped = matches.reduce<Record<number, Record<number, MatchRow[]>>>((acc, m) => {
    if (!acc[m.room_code]) acc[m.room_code] = {}
    if (!acc[m.room_code][m.round]) acc[m.room_code][m.round] = []
    acc[m.room_code][m.round].push(m)
    return acc
  }, {})

  const roomCodes = Object.keys(grouped).map(Number).sort((a, b) => b - a)

  if (loading) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center">
        <p className="text-neutral-400">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6 pt-4">
          <Link to="/" className="text-amber-500 text-sm font-medium">&larr; Home</Link>
          <h1 className="text-xl font-bold">
            <span className="text-white">Admin</span>
            <span className="text-amber-500 italic"> Panel</span>
          </h1>
          <div className="w-14" />
        </div>

        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          className="w-full py-3 bg-green-700 text-white font-bold uppercase rounded-lg disabled:opacity-50 active:scale-[0.98] transition-transform mb-4 cursor-pointer"
        >
          {recalculating ? 'Recalculating...' : 'Recalculate ELO'}
        </button>

        <PlayerManager onDataChanged={loadMatches} />

        <h2 className="text-neutral-400 text-xs font-bold uppercase mb-3 tracking-wider">Matches</h2>
        {roomCodes.length === 0 ? (
          <p className="text-neutral-400 text-center">No matches found.</p>
        ) : (
          roomCodes.map(roomCode => {
            const rounds = Object.keys(grouped[roomCode]).map(Number).sort((a, b) => b - a)
            return (
              <div key={roomCode} className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-white font-bold text-sm">Room {roomCode}</h3>
                  {roomDates[roomCode] && (
                    <span className="text-neutral-500 text-xs">
                      {new Date(roomDates[roomCode]).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {rounds.map(round => (
                  <div key={round} className="bg-neutral-800 rounded-lg overflow-hidden mb-3">
                    <div className="px-4 py-2 bg-neutral-700">
                      <span className="text-neutral-300 text-xs font-bold uppercase">Round {round}</span>
                    </div>
                    <div className="p-2">
                      {grouped[roomCode][round].map(match => (
                        <div key={match.id} className="px-3 py-2 mb-1 last:mb-0 bg-neutral-700/50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => changeWinner(match.id, match.player1)}
                              className={`flex-1 text-sm text-right px-2 py-1 rounded cursor-pointer active:scale-95 transition-all ${
                                match.winner === match.player1
                                  ? 'bg-green-600/30 text-green-400 font-bold'
                                  : 'text-white'
                              }`}
                            >
                              {match.player1}
                            </button>
                            <span className="text-amber-500 text-xs font-bold">VS</span>
                            <button
                              onClick={() => changeWinner(match.id, match.player2)}
                              className={`flex-1 text-sm text-left px-2 py-1 rounded cursor-pointer active:scale-95 transition-all ${
                                match.winner === match.player2
                                  ? 'bg-green-600/30 text-green-400 font-bold'
                                  : 'text-white'
                              }`}
                            >
                              {match.player2}
                            </button>
                            <button
                              onClick={() => deleteMatch(match.id)}
                              className="text-red-400 text-sm ml-1 px-1 cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export function Admin() {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('verify_admin_password', {
      password,
    })
    if (rpcError || !data) {
      setError('Incorrect password')
      setLoading(false)
      return
    }
    setAuthenticated(true)
    setLoading(false)
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-center mb-8">
            <span className="text-white">Admin</span>
            <span className="text-amber-500 italic"> Login</span>
          </h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="Password"
            className="w-full px-4 py-3 rounded-lg bg-neutral-800 border border-neutral-600 text-white placeholder-neutral-400 text-lg text-center focus:outline-none focus:border-neutral-500 mb-4"
            autoFocus
          />
          <button
            onClick={handleLogin}
            disabled={loading || !password}
            className="w-full py-3 bg-amber-600 text-white font-bold uppercase rounded-lg disabled:opacity-50 active:scale-[0.98] transition-transform cursor-pointer"
          >
            {loading ? 'Verifying...' : 'Login'}
          </button>
          {error && <p className="mt-4 text-red-400 text-center">{error}</p>}
          <Link to="/" className="block text-center mt-6 text-neutral-400 text-sm">
            &larr; Home
          </Link>
        </div>
      </div>
    )
  }

  return <AdminPanel />
}
