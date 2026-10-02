export default function Progress({ stats, name }) {
  if (!stats) return <><h1>Прогресс</h1><p className="sub">Загрузка…</p></>
  const unlocked = stats.achievements.filter(a => a.unlocked).length
  return (
    <>
      <h1>Прогресс</h1>
      <p className="sub">Всё, что вы заработали, в одном месте.</p>

      <div className="hero">
        <h2>{name.trim() || 'Аноним'}</h2>
        <b className="lvl">Уровень {stats.level}</b>
        <div className="bar"><div style={{ width: Math.min(100, stats.level_xp / stats.level_need * 100) + '%' }} /></div>
        <p>{stats.level_xp} / {stats.level_need} XP</p>
      </div>

      <div className="tiles">
        <div className="tile"><b>{stats.levels_done}/{stats.levels_total}</b><small>Уровни</small></div>
        <div className="tile"><b>{stats.stars}/{stats.stars_total}</b><small>Звёзды</small></div>
        <div className="tile"><b>{stats.streak} д</b><small>Серия</small></div>
        <div className="tile"><b>{stats.best_survival != null ? stats.best_survival + ' c' : '—'}</b><small>Лучшее выживание</small></div>
        <div className="tile"><b>{stats.max_rps ? Math.round(stats.max_rps).toLocaleString('ru') : '—'}</b><small>Макс. запр/с</small></div>
        <div className="tile"><b>{stats.best_p95 != null ? Math.round(stats.best_p95) + ' мс' : '—'}</b><small>Лучший p95</small></div>
      </div>

      <h3>Достижения · {unlocked}/{stats.achievements.length}</h3>
      {stats.achievements.map(a => (
        <div key={a.code} className={'ach' + (a.unlocked ? ' on' : '')}>
          <span className="ring">{a.unlocked ? '✓' : ''}</span>
          <span><b>{a.title}</b><small>{a.desc}</small></span>
        </div>
      ))}
    </>
  )
}
