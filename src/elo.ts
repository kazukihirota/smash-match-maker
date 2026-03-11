import { supabase } from './supabase'

const K = 32
const INITIAL_ELO = 1000

function expectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400))
}

export async function recalculateScores(): Promise<void> {
  const { data: matches, error } = await supabase
    .from('matches')
    .select('*')
    .eq('completed', true)
    .not('winner', 'is', null)
    .order('id', { ascending: true })

  if (error) {
    console.error('Failed to fetch matches for Elo recalculation:', error)
    return
  }

  const elo: Record<string, number> = {}
  const wins: Record<string, number> = {}
  const losses: Record<string, number> = {}

  for (const match of matches) {
    const { player1, player2, winner } = match

    if (!elo[player1]) elo[player1] = INITIAL_ELO
    if (!elo[player2]) elo[player2] = INITIAL_ELO
    if (!wins[player1]) wins[player1] = 0
    if (!wins[player2]) wins[player2] = 0
    if (!losses[player1]) losses[player1] = 0
    if (!losses[player2]) losses[player2] = 0

    const e1 = expectedScore(elo[player1], elo[player2])
    const e2 = expectedScore(elo[player2], elo[player1])

    const s1 = winner === player1 ? 1 : 0
    const s2 = winner === player2 ? 1 : 0

    elo[player1] = Math.round(elo[player1] + K * (s1 - e1))
    elo[player2] = Math.round(elo[player2] + K * (s2 - e2))

    if (winner === player1) {
      wins[player1]++
      losses[player2]++
    } else {
      wins[player2]++
      losses[player1]++
    }
  }

  const rows = Object.keys(elo).map((player_name) => ({
    player_name,
    elo_rating: elo[player_name],
    wins: wins[player_name],
    losses: losses[player_name],
  }))

  if (rows.length === 0) return

  const { error: upsertError } = await supabase
    .from('player_scores')
    .upsert(rows, { onConflict: 'player_name' })

  if (upsertError) {
    console.error('Failed to upsert player scores:', upsertError)
  }
}
