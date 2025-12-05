import { useState, useEffect } from 'react'

const STORAGE_KEY = 'smash-match-maker-names'

interface Match {
  person1: string
  person2: string
  timestamp: number
}

function App() {
  const [names, setNames] = useState<string[]>([])
  const [newName, setNewName] = useState('')
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null)
  const [matchHistory, setMatchHistory] = useState<Match[]>([])
  const [isDrawing, setIsDrawing] = useState(false)

  // Load names from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        setNames(JSON.parse(saved))
      } catch {
        // Invalid JSON, ignore
      }
    }
  }, [])

  // Save names to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(names))
  }, [names])

  const addName = () => {
    const trimmed = newName.trim()
    if (trimmed && !names.includes(trimmed)) {
      setNames([...names, trimmed])
      setNewName('')
    }
  }

  const removeName = (nameToRemove: string) => {
    setNames(names.filter(name => name !== nameToRemove))
  }

  const clearAll = () => {
    if (confirm('Clear all names?')) {
      setNames([])
      setCurrentMatch(null)
      setMatchHistory([])
    }
  }

  const drawMatch = async () => {
    if (names.length < 2) return

    setIsDrawing(true)
    setCurrentMatch(null)

    // Shuffle animation
    const shuffleCount = 10
    for (let i = 0; i < shuffleCount; i++) {
      await new Promise(resolve => setTimeout(resolve, 100))
      const shuffled = [...names].sort(() => Math.random() - 0.5)
      setCurrentMatch({
        person1: shuffled[0],
        person2: shuffled[1],
        timestamp: Date.now()
      })
    }

    // Final selection
    const shuffled = [...names].sort(() => Math.random() - 0.5)
    const match: Match = {
      person1: shuffled[0],
      person2: shuffled[1],
      timestamp: Date.now()
    }
    setCurrentMatch(match)
    setMatchHistory(prev => [match, ...prev].slice(0, 10))
    setIsDrawing(false)
  }

  return (
    <div className="min-h-screen p-4 pb-8">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <h1 className="text-3xl font-bold text-white text-center mb-6 drop-shadow-lg">
          Smash Match Maker 💕
        </h1>

        {/* Add Name Form */}
        <div className="bg-white/90 backdrop-blur rounded-2xl p-4 shadow-xl mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addName()}
              placeholder="Enter a name..."
              className="flex-1 px-4 py-3 rounded-xl border-2 border-purple-200 focus:border-purple-500 focus:outline-none text-lg"
            />
            <button
              onClick={addName}
              disabled={!newName.trim()}
              className="px-6 py-3 bg-purple-600 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
            >
              Add
            </button>
          </div>
        </div>

        {/* Names List */}
        <div className="bg-white/90 backdrop-blur rounded-2xl p-4 shadow-xl mb-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-gray-700">
              Names ({names.length})
            </h2>
            {names.length > 0 && (
              <button
                onClick={clearAll}
                className="text-sm text-red-500 hover:text-red-700"
              >
                Clear All
              </button>
            )}
          </div>

          {names.length === 0 ? (
            <p className="text-gray-400 text-center py-4">
              Add at least 2 names to start matching!
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {names.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-purple-100 to-pink-100 rounded-full text-purple-700 font-medium"
                >
                  {name}
                  <button
                    onClick={() => removeName(name)}
                    className="ml-1 w-5 h-5 flex items-center justify-center rounded-full hover:bg-purple-200 text-purple-500"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Draw Button */}
        <button
          onClick={drawMatch}
          disabled={names.length < 2 || isDrawing}
          className="w-full py-4 bg-gradient-to-r from-pink-500 to-orange-400 text-white text-xl font-bold rounded-2xl shadow-xl disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform mb-4"
        >
          {isDrawing ? '🎲 Drawing...' : '🎲 Draw Match!'}
        </button>

        {/* Current Match Result */}
        {currentMatch && (
          <div className="bg-white/90 backdrop-blur rounded-2xl p-6 shadow-xl mb-4 text-center animate-[bounce_0.5s_ease-in-out]">
            <p className="text-sm text-gray-500 mb-2">Match Result</p>
            <div className="flex items-center justify-center gap-4 text-2xl font-bold">
              <span className="text-purple-600">{currentMatch.person1}</span>
              <span className="text-3xl">💕</span>
              <span className="text-pink-600">{currentMatch.person2}</span>
            </div>
          </div>
        )}

        {/* Match History */}
        {matchHistory.length > 1 && (
          <div className="bg-white/90 backdrop-blur rounded-2xl p-4 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-700 mb-3">
              History
            </h2>
            <div className="space-y-2">
              {matchHistory.slice(1).map((match, idx) => (
                <div
                  key={match.timestamp + idx}
                  className="flex items-center justify-center gap-2 text-gray-600 text-sm py-1 border-b border-gray-100 last:border-0"
                >
                  <span>{match.person1}</span>
                  <span className="text-pink-400">💕</span>
                  <span>{match.person2}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
