export interface Match {
  id?: number
  player1: string
  player2: string
  completed: boolean
  winner: string | null
  round: number
  position: number
}

export interface Room {
  id: number
  room_code: number
  creator_token: string
  players: string[]
  created_at: string
}

export type Role = 'creator' | 'viewer'
