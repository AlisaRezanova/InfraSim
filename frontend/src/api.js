// Тонкая обёртка над REST API бэкенда.
function playerId() {
  let id = null
  try { id = localStorage.getItem('infrasim_player') } catch { /* нет доступа к localStorage */ }
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now())
    try { localStorage.setItem('infrasim_player', id) } catch { /* ignore */ }
  }
  return id
}
export const PLAYER = playerId()

async function req(path, opts) {
  const r = await fetch('/api' + path, opts)
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
  return r.json()
}
const post = (path, body) => req(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

export const getLevels = () => req('/levels')
export const getProgress = () => req('/progress?player_id=' + PLAYER)
export const getLeaderboard = () => req('/leaderboard')
export const getWorkloads = () => req('/workloads')
export const getStats = () => req('/stats?player_id=' + PLAYER)
export const saveResult = r => post('/result', { player_id: PLAYER, ...r })
export const resetPlayer = () => req('/player?player_id=' + PLAYER, { method: 'DELETE' })
