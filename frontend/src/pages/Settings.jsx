import { useState } from 'react'
import * as api from '../api.js'

export default function Settings({ name, onNameChange, speed, onSpeedChange, onReset }) {
  const [msg, setMsg] = useState('')
  const reset = () => {
    if (!confirm('Удалить весь прогресс, рекорды и достижения? Это нельзя отменить.')) return
    api.resetPlayer().then(() => { setMsg('Прогресс сброшен'); onReset() }).catch(e => setMsg('Ошибка: ' + e.message))
  }
  return (
    <>
      <h1>Настройки</h1>
      <p className="sub">Имя, скорость и сброс прогресса.</p>

      <h3>Имя в рейтинге</h3>
      <input type="text" maxLength={24} value={name} onChange={e => onNameChange(e.target.value)} placeholder="Аноним" />

      <h3>Скорость симуляции по умолчанию</h3>
      <div className="seg">
        {[1, 2, 4].map(v => <button key={v} className={speed === v ? 'sel' : ''} onClick={() => onSpeedChange(v)}>{v}×</button>)}
      </div>

      <h3>Данные</h3>
      <button onClick={reset}>🗑 Сбросить прогресс</button>
      {msg && <p className="sub">{msg}</p>}
    </>
  )
}
