export interface Match {
  id: string
  player1: string
  player2: string
  completed: boolean
  winner: string | null
}

export interface Room {
  id: number
  room_code: number
  creator_token: string
  players: string[]
  matches: Match[]
  created_at: string
}

export type Role = 'creator' | 'viewer'
