import { useState } from 'react'
import { supabase } from './supabase.ts'
import { Room } from './Room.tsx'
import type { Role } from './types.ts'

const CREATOR_TOKEN_KEY = 'smash-creator-token'

function App() {
  const [roomCode, setRoomCode] = useState<number | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [joinInput, setJoinInput] = useState('')
  const [showJoin, setShowJoin] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const createRoom = async () => {
    setLoading(true)
    setError('')
    const token = crypto.randomUUID()
    const code = Math.floor(1000 + Math.random() * 9000)

    const defaultPlayers = ['Kazuki', 'Jason', 'Taiga', 'Kiki', 'Brad']
    const { error: insertError } = await supabase
      .from('rooms')
      .insert({ room_code: code, creator_token: token, players: defaultPlayers })

    if (insertError) {
      const retryCode = Math.floor(1000 + Math.random() * 9000)
      const { error: retryError } = await supabase
        .from('rooms')
        .insert({ room_code: retryCode, creator_token: token, players: defaultPlayers })

      if (retryError) {
        setError('Failed to create room. Try again.')
        setLoading(false)
        return
      }
      localStorage.setItem(CREATOR_TOKEN_KEY, token)
      setRoomCode(retryCode)
    } else {
      localStorage.setItem(CREATOR_TOKEN_KEY, token)
      setRoomCode(code)
    }
    setRole('creator')
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
      .select('room_code, created_at')
      .eq('room_code', code)
      .single()

    if (fetchError || !data) {
      setError('Room not found.')
      setLoading(false)
      return
    }

    const created = new Date(data.created_at).getTime()
    if (Date.now() - created > 24 * 60 * 60 * 1000) {
      setError('Room has expired.')
      setLoading(false)
      return
    }

    setRoomCode(code)
    setRole('viewer')
    setLoading(false)
  }

  const leaveRoom = () => {
    setRoomCode(null)
    setRole(null)
    setJoinInput('')
    setShowJoin(false)
    setError('')
  }

  if (roomCode && role) {
    return (
      <Room
        roomCode={roomCode}
        role={role}
        creatorToken={role === 'creator' ? localStorage.getItem(CREATOR_TOKEN_KEY)! : null}
        onLeave={leaveRoom}
      />
    )
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
              className="w-full py-4 bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 text-white text-xl font-bold uppercase rounded-lg disabled:opacity-50 active:scale-[0.98] transition-transform shadow-lg shadow-orange-500/30"
            >
              {loading ? 'Creating...' : 'Create Room'}
            </button>
          )}

          {!showJoin ? (
            <button
              onClick={() => setShowJoin(true)}
              className="w-full py-4 bg-neutral-700 text-white text-xl font-bold uppercase rounded-lg active:scale-[0.98] transition-transform"
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
        </div>

        {error && (
          <p className="mt-4 text-red-400 text-center">{error}</p>
        )}
      </div>
    </div>
  )
}

export default App
