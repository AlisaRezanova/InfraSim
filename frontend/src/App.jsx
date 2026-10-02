import { useEffect, useState } from 'react'
import * as api from './api.js'
import { load, save } from './settings.js'
import Game from './Game.jsx'
import Play from './pages/Play.jsx'
import Sandbox from './pages/Sandbox.jsx'
import Learn from './pages/Learn.jsx'
import Progress from './pages/Progress.jsx'
import Settings from './pages/Settings.jsx'

const TABS = [
  ['play', '▶', 'Играть'],
  ['sandbox', '🧪', 'Песочница'],
  ['learn', '📖', 'Учёба'],
  ['progress', '🏆', 'Прогресс'],
  ['settings', '⚙️', 'Настройки'],
]

export default function App() {
  const [tab, setTab] = useState('play')
  const [levels, setLevels] = useState(null)
  const [workloads, setWorkloads] = useState([])
  const [progress, setProgress] = useState({})
  const [board, setBoard] = useState([])
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)
  const [play, setPlay] = useState(null) // { mode, idx, workload }
  const [name, setName] = useState(() => load('name', ''))
  const [speed, setSpeed] = useState(() => +load('speed', 1))

  const refresh = () => Promise.all([api.getLevels(), api.getProgress(), api.getLeaderboard(), api.getWorkloads(), api.getStats()])
    .then(([l, p, b, w, s]) => { setLevels(l); setProgress(p); setBoard(b); setWorkloads(w); setStats(s); setError(null) })
    .catch(e => setError(String(e.message || e)))

  useEffect(() => { refresh() }, [])

  const changeName = v => { setName(v); save('name', v) }
  const changeSpeed = v => { setSpeed(v); save('speed', v) }
  const start = (mode, idx = 0, workload = null) => setPlay({ mode, idx, workload })

  if (play && levels) {
    return <Game key={play.mode + play.idx + (play.workload?.id || '') + (play.n || 0)}
      mode={play.mode} levelIdx={play.idx} workload={play.workload}
      levels={levels} name={name} onNameChange={changeName} defaultSpeed={speed}
      onExit={() => { setPlay(null); refresh() }}
      onNext={idx => setPlay({ mode: 'level', idx })}
      onRetry={() => setPlay(p => ({ ...p, n: (p.n || 0) + 1 }))} />
  }

  return (
    <div className="app">
      <main className="page">
        {error && <p className="bad">Не удалось связаться с сервером: {error}. Запущен ли backend?</p>}
        {!levels && !error && <p className="sub">Загрузка…</p>}
        {levels && <>
          {tab === 'play' && <Play levels={levels} progress={progress} board={board} onPlay={start} />}
          {tab === 'sandbox' && <Sandbox workloads={workloads} onPlay={start} />}
          {tab === 'learn' && <Learn />}
          {tab === 'progress' && <Progress stats={stats} name={name} />}
          {tab === 'settings' && <Settings name={name} onNameChange={changeName} speed={speed}
            onSpeedChange={changeSpeed} onReset={refresh} />}
        </>}
        {!levels && tab === 'learn' && <Learn />}
      </main>
      <nav className="tabbar">
        {TABS.map(([id, icon, label]) => (
          <button key={id} className={tab === id ? 'sel' : ''} onClick={() => setTab(id)}>
            <span>{icon}</span>{label}
          </button>
        ))}
      </nav>
    </div>
  )
}
