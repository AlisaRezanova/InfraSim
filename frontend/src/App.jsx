import { useEffect, useState } from 'react'
import * as api from './api.js'
import Game from './Game.jsx'

const stars = n => '★'.repeat(n) + '☆'.repeat(3 - n)

export default function App() {
  const [levels, setLevels] = useState(null)
  const [progress, setProgress] = useState({})
  const [board, setBoard] = useState([])
  const [error, setError] = useState(null)
  const [play, setPlay] = useState(null) // { mode, idx }
  const [name, setName] = useState(() => { try { return localStorage.getItem('infrasim_name') || '' } catch { return '' } })

  const refresh = () => Promise.all([api.getLevels(), api.getProgress(), api.getLeaderboard()])
    .then(([l, p, b]) => { setLevels(l); setProgress(p); setBoard(b); setError(null) })
    .catch(e => setError(String(e.message || e)))

  useEffect(() => { refresh() }, [])

  const changeName = v => { setName(v); try { localStorage.setItem('infrasim_name', v) } catch { /* ignore */ } }

  if (play && levels) {
    return <Game key={play.mode + play.idx + (play.n || 0)} mode={play.mode} levelIdx={play.idx}
      levels={levels} name={name} onNameChange={changeName}
      onExit={() => { setPlay(null); refresh() }}
      onNext={idx => setPlay({ mode: 'level', idx })}
      onRetry={() => setPlay(p => ({ ...p, n: (p.n || 0) + 1 }))} />
  }

  return (
    <div className="ov">
      <div className="card">
        <h2>InfraSim</h2>
        <p>Проектируйте инфраструктуру: перетаскивайте компоненты, соединяйте их и смотрите, как система живёт под нагрузкой.
          Следите за <b>задержкой</b>, <b>стоимостью</b> и <b>ошибками</b>.</p>
        {error && <p className="bad">Не удалось связаться с сервером: {error}. Запущен ли backend?</p>}
        {levels && <>
          <h3>Кампания</h3>
          {levels.map((l, i) => (
            <button key={i} className="lv" onClick={() => setPlay({ mode: 'level', idx: i })}>
              <span className="n">{i + 1}</span>
              <span>{l.name}<small>{l.story.slice(0, 70)}…</small></span>
              <span className="s">{stars(progress[i] || 0)}</span>
            </button>
          ))}
          <h3>Режимы</h3>
          <p style={{ margin: '4px 0' }}>Ваше имя для рейтинга:{' '}
            <input type="text" maxLength={24} value={name} onChange={e => changeName(e.target.value)} placeholder="Аноним" /></p>
          <button className="lv" onClick={() => setPlay({ mode: 'survival' })}>
            <span>♾ Выживание<small>Бесконечная нагрузка и инциденты — кто продержится дольше</small></span>
          </button>
          <button className="lv" onClick={() => setPlay({ mode: 'sandbox' })}>
            <span>🧪 Песочница<small>Свободное строительство, нагрузка вручную</small></span>
          </button>
          <h3>Рейтинг выживания</h3>
          {board.length === 0 ? <p>Пока никого. Станьте первым!</p> :
            <table className="board"><tbody>
              {board.map((r, i) => <tr key={i}><td>{i + 1}</td><td>{r.name}</td><td style={{ textAlign: 'right' }}>{r.secs} c</td></tr>)}
            </tbody></table>}
        </>}
        {!levels && !error && <p>Загрузка…</p>}
      </div>
    </div>
  )
}
