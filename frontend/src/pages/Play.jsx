const stars = n => '★'.repeat(n) + '☆'.repeat(3 - n)

export default function Play({ levels, progress, board, onPlay }) {
  const done = Object.values(progress).filter(s => s > 0).length
  const total = Object.values(progress).reduce((a, s) => a + s, 0)
  const next = levels.findIndex((_, i) => !(progress[i] > 0))
  const cur = next === -1 ? levels.length - 1 : next

  return (
    <>
      <h1>Играть</h1>
      <p className="sub">Продолжите кампанию или попробуйте режим выживания.</p>

      <div className="hero">
        <small>Уровень {cur + 1}{next === -1 ? ' · всё пройдено' : ''}</small>
        <h2>{levels[cur].name}</h2>
        <p>{levels[cur].story}</p>
        <button className="primary" onClick={() => onPlay('level', cur)}>▶ {next === -1 ? 'Переиграть' : 'Продолжить'}</button>
      </div>

      <div className="tiles">
        <div className="tile"><b>{done}/{levels.length}</b><small>Уровни</small></div>
        <div className="tile"><b>{total}/{levels.length * 3}</b><small>Звёзды</small></div>
        <div className="tile"><b>{board[0] ? board[0].secs + ' c' : '—'}</b><small>Рекорд выживания</small></div>
      </div>

      <h3>Кампания</h3>
      {levels.map((l, i) => (
        <button key={i} className="lv" onClick={() => onPlay('level', i)}>
          <span className="n">{i + 1}</span>
          <span>{l.name}<small>{l.story.slice(0, 70)}…</small></span>
          <span className="s">{stars(progress[i] || 0)}</span>
        </button>
      ))}

      <h3>Бесконечный режим</h3>
      <button className="lv" onClick={() => onPlay('survival')}>
        <span>♾ Выживание<small>Бесконечная нагрузка и инциденты — кто продержится дольше</small></span>
      </button>

      <h3>Рейтинг выживания</h3>
      {board.length === 0 ? <p className="sub">Пока никого. Станьте первым!</p> :
        <table className="board"><tbody>
          {board.map((r, i) => <tr key={i}><td>{i + 1}</td><td>{r.name}</td><td style={{ textAlign: 'right' }}>{r.secs} c</td></tr>)}
        </tbody></table>}
    </>
  )
}
