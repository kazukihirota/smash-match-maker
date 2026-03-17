import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase.ts'

interface RecentRoom {
  room_code: number
  players: string[]
  created_at: string
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function RecentRooms({ onJoin }: { onJoin: (code: number) => void }) {
  const [rooms, setRooms] = useState<RecentRoom[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRooms = async () => {
      const { data } = await supabase
        .from('rooms')
        .select('room_code, players, created_at')
        .order('created_at', { ascending: false })
        .limit(5)
      if (data) setRooms(data)
      setLoading(false)
    }
    fetchRooms()
  }, [])

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Recent Rooms</h1>
          <Link to="/" className="text-neutral-400 text-sm">
            ← Back
          </Link>
        </div>

        {loading ? (
          <p className="text-neutral-400 text-center mt-8">Loading...</p>
        ) : rooms.length === 0 ? (
          <p className="text-neutral-400 text-center mt-8">No rooms yet.</p>
        ) : (
          <div className="space-y-2">
            {rooms.map(room => (
              <button
                key={room.room_code}
                onClick={() => onJoin(room.room_code)}
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
        )}
      </div>
    </div>
  )
}
