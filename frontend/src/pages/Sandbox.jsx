export default function Sandbox({ workloads, onPlay }) {
  return (
    <>
      <h1>Песочница</h1>
      <p className="sub">Без условий провала и бюджета. Постройте схему и узнайте, где она сломается.</p>

      <h3>Выберите нагрузку</h3>
      <p className="sub">Нагрузка — это трафик, который должна обслужить ваша схема. Выберите ближайшую по профилю.</p>
      {workloads.map(w => (
        <button key={w.id} className="lv" onClick={() => onPlay('sandbox', 0, w)}>
          <span>{w.name}<small>{w.story}</small>
            <small>{w.rps} запр/с в базе · {Math.round(w.ratio * 100)}% чтений · {w.region}</small></span>
          <span className="s">›</span>
        </button>
      ))}
      <button className="lv" onClick={() => onPlay('sandbox', 0, null)}>
        <span>Своя нагрузка<small>Чистый холст: нагрузку задаёте ползунками сами</small></span>
        <span className="s">›</span>
      </button>
    </>
  )
}
