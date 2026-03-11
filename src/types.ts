export interface Match {
  id?: number
  player1: string
  player2: string
  completed: boolean
  winner: string | null
  round: number
  position: number
  player1_character_id: number | null
  player2_character_id: number | null
}

export interface Character {
  id: number
  name: string
  fighter_number: string
  image_slug: string
}

export interface PlayerDefault {
  id?: number
  player_name: string
  default_character_id: number | null
}

export interface Room {
  id: number
  room_code: number
  creator_token: string
  players: string[]
  created_at: string
}

