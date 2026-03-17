import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from './supabase.ts'
import { Room } from './Room.tsx'
import { Stats } from './Stats.tsx'
import { Scoreboard } from './Scoreboard.tsx'
import { Admin } from './Admin.tsx'
import { RecentRooms } from './RecentRooms.tsx'
import { Toaster } from 'sonner'

function App() {
  return (
    <BrowserRouter>
      <Toaster theme="dark" position="top-center" richColors />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/scoreboard" element={<Scoreboard />} />
        <Route path="/recent" element={<RecentRoomsPage />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  )
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

function Home() {
  const location = useLocation()
  const [roomCode, setRoomCode] = useState<number | null>(
    (location.state as { roomCode?: number })?.roomCode ?? null
  )
  const [joinInput, setJoinInput] = useState('')
  const [showJoin, setShowJoin] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  interface ActiveRoom {
    room_code: number
    players: string[]
    created_at: string
  }

  const [activeRooms, setActiveRooms] = useState<ActiveRoom[]>([])

  useEffect(() => {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

    const fetchRooms = async () => {
      const { data } = await supabase
        .from('rooms')
        .select('room_code, players, created_at')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
      if (data) setActiveRooms(data)
    }

    fetchRooms()

    const channel = supabase
      .channel('lobby-rooms')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms' },
        () => { fetchRooms() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const createRoom = async () => {
    setLoading(true)
    setError('')
    const token = crypto.randomUUID()
    const code = Math.floor(1000 + Math.random() * 9000)

    const { data: defaults } = await supabase
      .from('player_defaults')
      .select('player_name')
      .order('id')
    const players = defaults?.map(d => d.player_name) ?? []

    const { error: insertError } = await supabase
      .from('rooms')
      .insert({ room_code: code, creator_token: token, players })

    if (insertError) {
      const retryCode = Math.floor(1000 + Math.random() * 9000)
      const { error: retryError } = await supabase
        .from('rooms')
        .insert({ room_code: retryCode, creator_token: token, players })

      if (retryError) {
        setError('Failed to create room. Try again.')
        setLoading(false)
        return
      }
      setRoomCode(retryCode)
    } else {
      setRoomCode(code)
    }
    setLoading(false)
  }

  const joinRoom = async () => {
    setLoading(true)
    setError('')
    const code = parseInt(joinInput, 10)
    if (isNaN(code) || code < 1000 || code > 9999) {
      setError('Enter a valid 4-digit room code.')
      setLoading(false)
      return
    }

    const { data, error: fetchError } = await supabase
      .from('rooms')
      .select('room_code')
      .eq('room_code', code)
      .single()

    if (fetchError || !data) {
      setError('Room not found.')
      setLoading(false)
      return
    }

    setRoomCode(code)
    setLoading(false)
  }

  const leaveRoom = () => {
    setRoomCode(null)
    setJoinInput('')
    setShowJoin(false)
    setError('')
  }

  if (roomCode) {
    return <Room roomCode={roomCode} onLeave={leaveRoom} />
  }

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="max-w-md mx-auto flex flex-col items-center justify-center min-h-[80vh]">
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-center">
            <span className="text-white">Smash</span>
            <span className="text-amber-500 italic"> Match Maker</span>
          </h1>
        </div>

        <div className="w-full space-y-4">
          {!showJoin && (
            <button
              onClick={createRoom}
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 text-white text-xl font-bold uppercase rounded-lg disabled:opacity-50 active:scale-[0.98] transition-transform shadow-lg shadow-orange-500/30 cursor-pointer"
            >
              {loading ? 'Creating...' : 'Create Room'}
            </button>
          )}

          {!showJoin ? (
            <button
              onClick={() => setShowJoin(true)}
              className="w-full py-4 bg-neutral-700 text-white text-xl font-bold uppercase rounded-lg active:scale-[0.98] transition-transform cursor-pointer"
            >
              Join Room
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                  placeholder="Room Code"
                  className="flex-1 px-4 py-3 rounded-lg bg-neutral-800 border border-neutral-600 text-white placeholder-neutral-400 text-lg text-center tracking-widest focus:outline-none focus:border-neutral-500"
                  autoFocus
                />
                <button
                  onClick={joinRoom}
                  disabled={loading || joinInput.length !== 4}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold uppercase text-sm disabled:opacity-50"
                >
                  Join
                </button>
              </div>
              <button
                onClick={() => { setShowJoin(false); setJoinInput(''); setError('') }}
                className="w-full py-2 text-neutral-400 text-sm"
              >
                ← Back
              </button>
            </div>
          )}

          {!showJoin && (
            <Link
              to="/scoreboard"
              className="w-full py-4 bg-neutral-800 text-amber-500 text-xl font-bold uppercase rounded-lg active:scale-[0.98] transition-transform text-center block"
            >
              Rankings
            </Link>
          )}

          {!showJoin && (
            <Link
              to="/recent"
              className="w-full py-3 text-neutral-400 text-sm text-center block"
            >
              Recent Rooms
            </Link>
          )}
        </div>

        {error && (
          <p className="mt-4 text-red-400 text-center">{error}</p>
        )}

        {activeRooms.length > 0 && (
          <div className="w-full mt-8">
            <h2 className="text-neutral-400 text-xs font-bold uppercase mb-3 tracking-wider">Active Rooms</h2>
            <div className="space-y-2">
              {activeRooms.map(room => (
                <button
                  key={room.room_code}
                  onClick={() => setRoomCode(room.room_code)}
                  className="w-full text-left px-4 py-3 bg-neutral-800 rounded-lg active:bg-neutral-700 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white font-bold tracking-widest">{room.room_code}</span>
                    <span className="text-neutral-500 text-xs">{timeAgo(room.created_at)}</span>
                  </div>
                  <div className="text-neutral-400 text-sm truncate">
                    {room.players.length > 0 ? room.players.join(', ') : 'No players yet'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function RecentRoomsPage() {
  const navigate = useNavigate()
  return <RecentRooms onJoin={(code) => navigate('/', { state: { roomCode: code } })} />
}

export default App
