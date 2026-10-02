import { useState } from 'react'
import { NT } from '../sim.js'
import { CATEGORIES, CONCEPTS, INFO } from '../content/learn.js'

export default function Learn() {
  const [tab, setTab] = useState('components')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null) // { kind, id }

  if (open) return <Detail open={open} onBack={() => setOpen(null)} />

  const f = q.trim().toLowerCase()
  const hit = (...xs) => !f || xs.some(x => x.toLowerCase().includes(f))

  return (
    <>
      <h1>Учёба</h1>
      <p className="sub">Что делает каждый компонент, как он ломается и почему. Здесь ничего не закрыто.</p>

      <div className="seg">
        <button className={tab === 'components' ? 'sel' : ''} onClick={() => setTab('components')}>Компоненты</button>
        <button className={tab === 'concepts' ? 'sel' : ''} onClick={() => setTab('concepts')}>Концепции</button>
      </div>
      <input type="text" className="search" placeholder="Поиск" value={q} onChange={e => setQ(e.target.value)} />

      {tab === 'components' && CATEGORIES.map(c => {
        const items = c.types.filter(t => hit(NT[t].name, INFO[t].tagline))
        return items.length > 0 && (
          <div key={c.id}>
            <h3>{c.title}</h3>
            {items.map(t => (
              <button key={t} className="lv" onClick={() => setOpen({ kind: 'component', id: t })}>
                <span className="ic">{NT[t].icon}</span>
                <span>{NT[t].name}<small>{INFO[t].tagline}</small></span>
                <span className="s">›</span>
              </button>
            ))}
          </div>
        )
      })}

      {tab === 'concepts' && CONCEPTS.filter(c => hit(c.title, c.summary)).map(c => (
        <button key={c.id} className="lv" onClick={() => setOpen({ kind: 'concept', id: c.id })}>
          <span>{c.title}<small>{c.summary}</small></span>
          <span className="s">›</span>
        </button>
      ))}
    </>
  )
}

function Detail({ open, onBack }) {
  if (open.kind === 'concept') {
    const c = CONCEPTS.find(x => x.id === open.id)
    return (
      <>
        <button onClick={onBack}>← Назад</button>
        <h1>{c.title}</h1>
        <p className="sub">{c.summary}</p>
        {c.body.map((p, i) => <p key={i} className="text">{p}</p>)}
      </>
    )
  }
  const d = NT[open.id], info = INFO[open.id]
  return (
    <>
      <button onClick={onBack}>← Назад</button>
      <h1>{d.icon} {d.name}</h1>
      <p className="sub">{info.tagline}</p>
      <p className="text">{d.desc}</p>
      {open.id !== 'src' && (
        <div className="tiles">
          <div className="tile"><b>{d.cap}</b><small>Запросов/с</small></div>
          <div className="tile"><b>${d.cost}/ч</b><small>Стоимость</small></div>
          <div className="tile"><b>{d.lat} мс</b><small>Задержка</small></div>
        </div>
      )}
      <h3>Как ломается</h3>
      <p className="text">{info.fails}</p>
      <h3>Советы</h3>
      <ul className="text">{info.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </>
  )
}
