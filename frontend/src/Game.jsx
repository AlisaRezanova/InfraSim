import { useEffect, useRef, useState } from 'react'
import * as sim from './sim.js'
import * as api from './api.js'

const { NT, TIER_CAP, TIER_COST } = sim
const VW = 1000, VH = 560, NW = 96, NH = 58
const col = u => (u >= 1 ? '#ff5d5d' : u >= 0.75 ? '#f0b83a' : '#4cd07d')
const SPLIT = sim.ZONE_SPLIT_Y ?? 280
const MULTI_OK = sim.MULTI_OK || []
const MAXCONN = sim.MAXCONN || { min: 20, max: 400, step: 20, def: 120 }
const zoneName = z => (z ? 'Б' : 'A')
const zoneIdx = n => (sim.zoneOf ? sim.zoneOf(n) : (n.y < SPLIT ? 0 : 1))
const zoneDown = z => !!(sim.zoneDown && sim.zoneDown(z))
const connsUsed = n => (sim.connsUsed ? sim.connsUsed(n) : 0)
const maxConnOf = n => n.maxConn ?? MAXCONN.def
const stars = n => '★'.repeat(n) + '☆'.repeat(3 - n)

const inNode = (n, p) => Math.abs(p.x - n.x) <= NW / 2 && Math.abs(p.y - n.y) <= NH / 2
const onPort = (n, p) => Math.hypot(p.x - (n.x + NW / 2), p.y - n.y) <= 13
const edgePts = e => { const a = sim.nodeById(e.a), b = sim.nodeById(e.b); return [a.x + NW / 2, a.y, b.x - NW / 2, b.y] }
function bez(t, x0, y0, x1, y1) {
  const c = Math.max(40, Math.abs(x1 - x0) / 2), m = 1 - t
  return {
    x: m ** 3 * x0 + 3 * m * m * t * (x0 + c) + 3 * m * t * t * (x1 - c) + t ** 3 * x1,
    y: m ** 3 * y0 + 3 * m * m * t * y0 + 3 * m * t * t * y1 + t ** 3 * y1,
  }
}
function edgeAt(p) {
  for (const e of sim.G.edges) {
    const [x0, y0, x1, y1] = edgePts(e)
    for (let t = 0; t <= 1; t += 0.05) { const q = bez(t, x0, y0, x1, y1); if (Math.hypot(q.x - p.x, q.y - p.y) < 9) return e }
  }
  return null
}
function freeSpot() {
  for (let x = 230; x <= 900; x += 120) for (let y = 100; y <= 480; y += 95)
    if (!sim.G.nodes.some(n => Math.abs(n.x - x) < NW && Math.abs(n.y - y) < NH + 8)) return { x, y }
  return { x: 200 + Math.random() * 700, y: 80 + Math.random() * 400 }
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

export default function Game({ mode, levelIdx, workload, levels, name, onNameChange, defaultSpeed = 1, onExit, onNext, onRetry }) {
  // Игра создаётся синхронно, до первого рендера: канвас должен смонтироваться сразу.
  useState(() => { sim.newGame(mode, levelIdx, mode === 'level' ? levels[levelIdx] : mode === 'sandbox' ? workload : null) })
  const canvasRef = useRef(null), stageRef = useRef(null)
  const ui = useRef({ sel: null, selEdge: null, conn: null, drag: null, mouse: { x: 0, y: 0 }, speed: defaultSpeed, view: { sc: 1, ox: 0, oy: 0 } })
  const [hud, setHud] = useState(null)
  const [, force] = useState(0)
  const [result, setResult] = useState(null)
  const [toast, setToast] = useState('')
  const [speed, setSpeed] = useState(defaultSpeed)
  const [sandbox, setSandbox] = useState({ rps: workload?.rps ?? 500, ratio: Math.round((workload?.ratio ?? 0.8) * 100) })
  const toastT = useRef(null)
  const refresh = () => force(n => n + 1)
  const say = t => { setToast(t); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), 1600) }

  // ---- инициализация игры и главный цикл ----
  useEffect(() => {
    const cv = canvasRef.current, ctx = cv.getContext('2d'), U = ui.current
    const resize = () => {
      const st = stageRef.current, dpr = window.devicePixelRatio || 1
      cv.width = st.clientWidth * dpr; cv.height = st.clientHeight * dpr
      const sc = Math.min(st.clientWidth / VW, st.clientHeight / VH)
      U.view = { sc, ox: (st.clientWidth - VW * sc) / 2, oy: (st.clientHeight - VH * sc) / 2, dpr }
    }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(stageRef.current)

    let last = performance.now(), acc = 0, hudT = 0, raf
    const loop = now => {
      const G = sim.G
      acc += Math.min(0.25, (now - last) / 1000); last = now
      while (acc >= 0.1) { acc -= 0.1; sim.step(G.running ? 0.1 * U.speed : 0.0001) }
      if (G.done) { const d = G.done; G.done = null; onDone(d) }
      draw(ctx, cv)
      if (now - hudT > 100) {
        hudT = now
        setHud({ time: G.time, running: G.running, m: G.m, bad: G.bad, dur: G.level.dur })
      }
      raf = requestAnimationFrame(loop)
    }
    const onDone = d => {
      setResult(d)
      api.saveResult({
        mode: d.survival ? 'survival' : 'level', level_idx: d.survival ? null : levelIdx, name: name.trim() || 'Аноним',
        passed: !!d.pass, stars: d.stars || 0, avg_cost: d.avg || 0, secs: d.secs || 0, p95: d.p95,
        max_rps: d.maxRps, hot_best: d.hotBest, over_best: d.overBest,
      }).then(reward => setResult(r => (r === d ? { ...d, reward } : r))).catch(() => {})
    }
    const kd = e => {
      if (e.code === 'Space') { e.preventDefault(); toggleRun() }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.target.matches?.('input')) removeSelected()
    }
    addEventListener('keydown', kd)
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('keydown', kd) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- отрисовка ----
  function draw(ctx, cv) {
    const G = sim.G, U = ui.current, { sc, ox, oy, dpr = 1 } = U.view
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.setTransform(sc * dpr, 0, 0, sc * dpr, ox * dpr, oy * dpr)
    const tnow = performance.now() / 1000
    for (let z = 0; z < 2; z++) {
      const y0 = z ? SPLIT : 0, h = z ? VH - SPLIT : SPLIT, down = zoneDown(z)
      ctx.fillStyle = down ? '#ff5d5d22' : z ? '#b48cff0d' : '#4da3ff0d'; ctx.fillRect(0, y0, VW, h)
      if (down) {
        ctx.fillStyle = `rgba(255,93,93,${0.07 + 0.07 * Math.sin(tnow * 5)})`; ctx.fillRect(0, y0, VW, h)
        ctx.save(); ctx.beginPath(); ctx.rect(0, y0, VW, h); ctx.clip()
        ctx.strokeStyle = '#ff5d5d30'; ctx.lineWidth = 2; ctx.beginPath()
        for (let k = -h; k < VW; k += 28) { ctx.moveTo(k, y0 + h); ctx.lineTo(k + h, y0) }
        ctx.stroke(); ctx.restore()
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = 'bold 12px system-ui'
      ctx.fillStyle = down ? '#ff8a8a' : '#8b97a8'
      ctx.fillText(down ? `Зона ${zoneName(z)} — отказ` : `Зона ${zoneName(z)}`, 10, y0 + (z ? 8 : 40))
    }
    ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = 1; ctx.setLineDash([8, 6]); ctx.beginPath()
    ctx.moveTo(0, SPLIT); ctx.lineTo(VW, SPLIT); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = '#ffffff10'
    for (let x = 20; x < VW; x += 40) for (let y = 20; y < VH; y += 40) ctx.fillRect(x, y, 2, 2)
    const now = performance.now() / 1000
    G.edges.forEach(e => {
      const [x0, y0, x1, y1] = edgePts(e), tgt = sim.nodeById(e.b)
      const bad = tgt.util >= 1 || !sim.alive(tgt)
      ctx.lineWidth = (e === U.selEdge ? 4 : 2) + Math.min(4, Math.log10(1 + e.rate) * 0.8)
      ctx.strokeStyle = e === U.selEdge ? '#4da3ff' : (bad ? '#ff5d5d66' : '#5b6b7e')
      const c = Math.max(40, Math.abs(x1 - x0) / 2)
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0 + c, y0, x1 - c, y1, x1, y1); ctx.stroke()
      ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - 9, y1 - 5); ctx.lineTo(x1 - 9, y1 + 5); ctx.fill()
      if (e.rate > 0.5) {
        const cnt = Math.min(9, 1 + Math.floor(Math.log10(1 + e.rate) * 2.2))
        ctx.fillStyle = bad ? '#ff8a8a' : '#8fd0ff'
        for (let i = 0; i < cnt; i++) {
          const q = bez(((now * 0.5 * Math.max(1, U.speed * 0.6)) + i / cnt) % 1, x0, y0, x1, y1)
          ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, 7); ctx.fill()
        }
      }
    })
    if (U.conn) {
      ctx.setLineDash([6, 5]); ctx.strokeStyle = '#4da3ff'; ctx.lineWidth = 2; ctx.beginPath()
      ctx.moveTo(U.conn.from.x + NW / 2, U.conn.from.y); ctx.lineTo(U.mouse.x, U.mouse.y); ctx.stroke(); ctx.setLineDash([])
    }
    G.nodes.forEach(n => {
      const d = NT[n.type], up = sim.alive(n), x = n.x - NW / 2, y = n.y - NH / 2
      ctx.fillStyle = up ? '#1c2733' : '#2a2a2a'; rr(ctx, x, y, NW, NH, 10); ctx.fill()
      ctx.lineWidth = n === U.sel ? 3 : 2
      ctx.strokeStyle = n === U.sel ? '#4da3ff' : !up ? '#666' : n.type === 'src' ? '#4da3ff' : col(n.util)
      ctx.stroke()
      if (n.multi && MULTI_OK.includes(n.type)) {
        ctx.strokeStyle = '#b48cff'; ctx.lineWidth = 1.5; rr(ctx, x - 4, y - 4, NW + 8, NH + 8, 13); ctx.stroke()
        ctx.fillStyle = '#b48cff'; rr(ctx, n.x - 24, y + NH + 1, 48, 14, 5); ctx.fill()
        ctx.fillStyle = '#0f141b'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('2 зоны', n.x, y + NH + 8)
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.font = '22px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(up ? d.icon : '💥', n.x, n.y - 8)
      ctx.font = '11px system-ui'; ctx.fillStyle = '#b9c4d2'; ctx.fillText(d.name, n.x, n.y + 13)
      if (n.type !== 'src') {
        ctx.fillStyle = '#0008'; ctx.fillRect(x + 8, y + NH - 9, NW - 16, 4)
        ctx.fillStyle = col(n.util); ctx.fillRect(x + 8, y + NH - 9, (NW - 16) * Math.min(1, n.util), 4)
        ctx.fillStyle = '#8b97a8'; ctx.font = '10px system-ui'; ctx.textAlign = 'left'
        ctx.fillText('●'.repeat(n.tier + 1), x + 6, y + 9)
        ctx.textAlign = 'right'; ctx.fillText(Math.round(n.util * 100) + '%', x + NW - 6, y + 9)
      }
      if (n.type === 'queue') {
        ctx.textAlign = 'center'; ctx.fillStyle = n.backlog > NT.queue.buf * 0.7 ? '#ff5d5d' : '#8b97a8'; ctx.font = '10px system-ui'
        ctx.fillText('в буфере: ' + Math.round(n.backlog), n.x, y - 8)
      }
      ctx.fillStyle = n === U.sel ? '#4da3ff' : '#3a4a5d'; ctx.beginPath(); ctx.arc(n.x + NW / 2, n.y, 7, 0, 7); ctx.fill()
      ctx.strokeStyle = '#0f141b'; ctx.lineWidth = 2; ctx.stroke()
    })
    const act = G.level.events.filter(ev => G.running && G.time >= ev.from && G.time < ev.to)
    if (act.length) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = 'bold 15px system-ui'; ctx.fillStyle = '#ff8a5d'
      ctx.fillText('⚠ ' + act.map(ev => ev.type === 'spike' ? 'ПИК НАГРУЗКИ ×' + ev.mult.toFixed(1)
        : ev.type === 'crash' ? 'ОТКАЗ: ' + NT[ev.target].name
        : ev.type === 'zone' ? 'ОТКАЗ ЗОНЫ ' + zoneName(ev.zone).toUpperCase() : 'ШКВАЛ ЗАПИСЕЙ').join(' · '), VW / 2, 24)
    }
  }

  // ---- ввод мыши/касаний ----
  const toLogical = e => {
    const r = canvasRef.current.getBoundingClientRect(), { sc, ox, oy } = ui.current.view
    return { x: (e.clientX - r.left - ox) / sc, y: (e.clientY - r.top - oy) / sc }
  }
  const onDown = e => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const U = ui.current, p = toLogical(e), G = sim.G; U.mouse = p
    const rev = [...G.nodes].reverse()
    for (const n of rev) if (onPort(n, p)) { U.conn = { from: n }; U.sel = n; U.selEdge = null; return refresh() }
    for (const n of rev) if (inNode(n, p)) { U.drag = { n, dx: p.x - n.x, dy: p.y - n.y }; U.sel = n; U.selEdge = null; return refresh() }
    U.selEdge = edgeAt(p); U.sel = null; refresh()
  }
  const onMove = e => {
    const U = ui.current, p = toLogical(e); U.mouse = p
    if (U.drag) {
      const { n, dx, dy } = U.drag
      if (n.type !== 'src') n.x = Math.max(NW / 2, Math.min(VW - NW / 2, p.x - dx))
      n.y = Math.max(NH / 2, Math.min(VH - NH / 2, p.y - dy))
    }
  }
  const onUp = e => {
    const U = ui.current, p = toLogical(e)
    if (U.conn) {
      const t = sim.G.nodes.find(n => n !== U.conn.from && inNode(n, p))
      if (t) {
        const r = sim.connect(U.conn.from.id, t.id)
        if (r === 'cycle') say('Циклы запрещены')
        else if (r === 'src1') say('У пользователей одна точка входа')
        else if (r === 'dup') say('Такая связь уже есть')
      }
      U.conn = null
    }
    U.drag = null; refresh()
  }

  // ---- действия ----
  const toggleRun = () => { if (!sim.G.done) sim.G.running = !sim.G.running }
  const removeSelected = () => {
    const U = ui.current
    if (U.selEdge) { sim.G.edges = sim.G.edges.filter(x => x !== U.selEdge); U.selEdge = null }
    else if (U.sel && U.sel.type !== 'src') { sim.removeNode(U.sel.id); U.sel = null }
    refresh()
  }
  const addFromPalette = type => { const p = freeSpot(), n = sim.addNode(type, p.x, p.y); ui.current.sel = n; ui.current.selEdge = null; refresh() }
  const duplicate = () => {
    const U = ui.current, o = U.sel
    if (!o || o.type === 'src') return
    const p = freeSpot(), n = sim.addNode(o.type, p.x, p.y)
    n.tier = o.tier
    if (o.multi) n.multi = true
    if (o.cross !== undefined) n.cross = o.cross
    if (o.maxConn !== undefined) n.maxConn = o.maxConn
    U.sel = n; U.selEdge = null; refresh()
  }
  const setSpd = v => { ui.current.speed = v; setSpeed(v) }
  const reset = () => { sim.resetRun(); setResult(null) }
  const setSand = (k, v) => {
    setSandbox(s => ({ ...s, [k]: v }))
    if (k === 'rps') sim.G.sandRps = v; else sim.G.sandRatio = v / 100
  }

  // ---- разметка ----
  const G = sim.G
  if (!G) return null
  const lvl = G.level, goal = lvl.goal, m = hud?.m || G.m
  const U = ui.current, sel = U.sel && G.nodes.includes(U.sel) ? U.sel : null
  const modeLabel = mode === 'level' ? 'Уровень ' + (levelIdx + 1) : mode === 'survival' ? 'Выживание' : 'Песочница'

  return (
    <div className="game">
      <div className="hud">
        <button onClick={onExit}>☰ Меню</button>
        <div className="m"><small>{modeLabel}</small><span style={{ fontWeight: 600 }}>{lvl.name}</span></div>
        <div className="m"><small>Время</small><b>{Math.floor(hud?.time || 0)}{isFinite(lvl.dur) ? ' / ' + lvl.dur : ''} c</b></div>
        <div className="m"><small>Запросов/с</small><b>{Math.round(m.rps)}</b></div>
        <div className="m"><small>Ошибки</small>
          <b className={(goal ? m.err > goal.err : m.err > 0.05) ? 'bad' : 'good'}>{(m.err * 100).toFixed(1)}%</b></div>
        <div className="m"><small>Задержка</small>
          <b className={goal && m.lat > goal.lat ? 'bad' : goal ? 'good' : ''}>{Math.round(m.lat)} мс</b></div>
        <div className="m"><small>Стоимость</small>
          <b className={goal && m.cost > goal.cost ? 'warn' : ''}>${Math.round(m.cost)}/ч</b></div>
        {mode === 'sandbox' && <>
          <label>RPS <input type="range" min="10" max="20000" value={sandbox.rps} onChange={e => setSand('rps', +e.target.value)} /></label>
          <label>Чтения <input type="range" min="0" max="100" value={sandbox.ratio} onChange={e => setSand('ratio', +e.target.value)} /></label>
        </>}
        <span className="grow" />
        {[1, 2, 4].map(v => <button key={v} className={speed === v ? 'sel' : ''} onClick={() => setSpd(v)}>{v}×</button>)}
        <button className="primary" onClick={toggleRun}>{hud?.running ? '⏸ Пауза' : (hud?.time > 0 ? '▶ Дальше' : '▶ Запуск')}</button>
        <button onClick={reset}>↺</button>
      </div>

      {isFinite(lvl.dur) && (
        <div className="progress"><div style={{ width: Math.min(100, (hud?.time || 0) / lvl.dur * 100) + '%' }} /></div>
      )}

      <div className="stage" ref={stageRef}>
        <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        <div className="goals">
          <b>{lvl.story}</b>
          {goal && <><br />Цели: ошибки ≤ {goal.err * 100}% · задержка ≤ {goal.lat} мс · ср. стоимость ≤ ${goal.cost}/ч
            <br />Допустимо «плохих» секунд: {(lvl.dur * 0.1).toFixed(0)} (сейчас {(hud?.bad || 0).toFixed(0)})</>}
        </div>
        {toast && <div className="toast">{toast}</div>}
        {(sel || U.selEdge) && <Inspector sel={sel} edge={U.selEdge} refresh={refresh}
          onDelete={removeSelected} onDuplicate={duplicate} />}
        <Hints lvl={lvl} mode={mode} />
      </div>

      <div className="palette">
        {lvl.allowed.map(t => (
          <button key={t} onClick={() => addFromPalette(t)}>{NT[t].icon} {NT[t].name}<small>${NT[t].cost}/ч</small></button>
        ))}
      </div>

      {result && <Result d={result} goal={goal} isLast={levelIdx >= levels.length - 1} mode={mode}
        name={name} onNameChange={onNameChange}
        onKeep={reset} onRetry={onRetry} onExit={onExit} onNext={() => onNext(levelIdx + 1)} />}
    </div>
  )
}

function Inspector({ sel, edge, refresh, onDelete, onDuplicate }) {
  if (edge) return (
    <div className="insp"><h3>Связь</h3><p>Поток: {Math.round(edge.rate)} запр/с</p>
      <div className="row"><button onClick={onDelete}>🗑 Удалить связь</button></div></div>
  )
  const d = NT[sel.type]
  const lambda = sel.type === 'lambda'
  const price = t => Math.round(d.cost * TIER_COST[t])
  return (
    <div className="insp">
      <h3>{d.icon} {d.name}</h3>
      <p>{d.desc}</p>
      {sel.type !== 'src' && <>
        <p>Уровень: {sel.tier + 1}/3 · мощность {Math.round(d.cap * TIER_CAP[sel.tier])} · {lambda ? `сейчас $${sim.nodeCost(sel).toFixed(1)}/ч (по нагрузке)` : `$${price(sel.tier)}/ч`}</p>
        <div className="row">
          {sel.tier > 0 && <button onClick={() => { sel.tier--; refresh() }}>⬇ Понизить</button>}
          {sel.tier < 2 && <button onClick={() => { sim.upgrade(sel); refresh() }}>{lambda ? '⬆ Улучшить (×2 мощность)' : `⬆ Улучшить (+$${price(sel.tier + 1) - price(sel.tier)}/ч)`}</button>}
          <button onClick={onDelete}>🗑 Удалить</button>
          <button onClick={onDuplicate}>⧉ Дублировать</button>
        </div>
        <p>Оценка стоимости: <b>${Number(sim.nodeCost(sel)).toFixed(1)}/ч</b></p>
        <p>Расположение: <b>{sel.multi && MULTI_OK.includes(sel.type) ? 'обе зоны' : 'Зона ' + zoneName(zoneIdx(sel))}</b>
          <br /><small>Перетащите блок вверх или вниз, чтобы переместить его между зонами.</small></p>
        {MULTI_OK.includes(sel.type) && <div className="opt">
          <div className="optrow"><span>Мульти-зона</span>
            <button className={'tog' + (sel.multi ? ' on' : '')} onClick={() => { if (sim.setMulti) sim.setMulti(sel, !sel.multi); else sel.multi = !sel.multi; refresh() }}>{sel.multi ? 'Вкл' : 'Выкл'}</button></div>
          <small>Переживает отказ зоны, но в 2 раза дороже.</small>
        </div>}
        {sel.type === 'lb' && <div className="opt">
          <div className="optrow"><span>Кросс-зона</span>
            <button className={'tog' + (sel.cross !== false ? ' on' : '')} onClick={() => { sel.cross = sel.cross === false; refresh() }}>{sel.cross !== false ? 'Вкл' : 'Выкл'}</button></div>
          <small>Включено: балансировка по обеим зонам. Выключено: только в своей зоне — быстрее, но без отказоустойчивости.</small>
        </div>}
        {(sel.type === 'db' || sel.type === 'nosql') && (() => {
          const mc = maxConnOf(sel), used = connsUsed(sel)
          const setMc = v => { sel.maxConn = Math.max(MAXCONN.min, Math.min(MAXCONN.max, v)); refresh() }
          return <div className="opt">
            <div className="optrow"><span>Макс. соединений</span>
              <span className="stepper">
                <button disabled={mc <= MAXCONN.min} onClick={() => setMc(mc - MAXCONN.step)}>−</button>
                <b>{mc}</b>
                <button disabled={mc >= MAXCONN.max} onClick={() => setMc(mc + MAXCONN.step)}>+</button>
              </span></div>
            <div className={'conns' + (used > mc ? ' bad' : '')}>занято {used} / {mc}</div>
            <small>Жёсткий потолок: каждый сервер держит пул соединений.</small>
          </div>
        })()}
      </>}
      <p style={{ marginBottom: 0 }}>Потяните за кружок справа от блока, чтобы соединить его с другим.</p>
    </div>
  )
}

function Hints({ lvl, mode }) {
  const G = sim.G, out = []
  const nodes = G.nodes.filter(n => n.type !== 'src')
  const hasZoneEv = (lvl.events || []).some(ev => ev.type === 'zone')
  if ((hasZoneEv || mode !== 'level') && nodes.length > 0 && !nodes.some(n => n.multi) &&
    nodes.every(n => zoneIdx(n) === zoneIdx(nodes[0])))
    out.push('Все ресурсы в одной зоне — отказ зоны остановит сервис')
  const hasStore = nodes.some(n => n.type === 'db' || n.type === 'nosql')
  const allowCache = (lvl.allowed || []).some(t => t === 'cache' || t === 'redis')
  if (hasStore && allowCache && !nodes.some(n => n.type === 'cache' || n.type === 'redis'))
    out.push('Нет кэша: каждое чтение идёт в БД')
  if (nodes.some(n => (n.type === 'db' || n.type === 'nosql') && connsUsed(n) > maxConnOf(n)))
    out.push('БД: соединений не хватает')
  if (!out.length) return null
  return <div className="hints">{out.slice(0, 2).map(t => <div key={t}>⚠ {t}</div>)}</div>
}

function Result({ d, goal, isLast, mode, name, onNameChange, onKeep, onRetry, onExit, onNext }) {
  if (d.survival) return (
    <div className="ov"><div className="card">
      <h2>Система упала</h2>
      <p>Вы продержались <b>{d.secs} c</b>. Результат отправлен в рейтинг под именем «{name.trim() || 'Аноним'}».</p>
      <Reward r={d.reward} />
      <p><button className="primary" onClick={onKeep}>↻ Ещё раз с моей схемой</button>{' '}
        <button onClick={onRetry}>С чистого листа</button>{' '}
        <button onClick={onExit}>Меню</button></p>
    </div></div>
  )
  return (
    <div className="ov"><div className="card">
      <h2>{d.pass ? 'Уровень пройден!' : 'Не получилось'}</h2>
      <p style={{ fontSize: 22, color: 'var(--warn)', margin: 0 }}>{stars(d.stars)}</p>
      <p>Средняя стоимость: <b className={d.avg > goal.cost ? 'bad' : 'good'}>${d.avg.toFixed(0)}/ч</b> (лимит ${goal.cost})<br />
        Плохих секунд: <b className={d.badFrac > 0.1 ? 'bad' : 'good'}>{(d.badFrac * 100).toFixed(0)}%</b> (допустимо ≤ 10%)<br />
        Задержка p95: <b>{Math.round(d.p95)} мс</b> · пик пропускной способности: <b>{Math.round(d.maxRps)} запр/с</b></p>
      <Reward r={d.reward} />
      <p>{d.pass ? '★★ — стоимость ≤ 80% лимита, ★★★ — ≤ 65% и почти без сбоев.'
        : 'Смотрите, где загорается красным: узкое место — там, где загрузка ≥ 100%.'}</p>
      <p>
        <button className={d.pass ? '' : 'primary'} onClick={onKeep}>↻ Повторить с моей схемой</button>{' '}
        {d.pass && !isLast && <button className="primary" onClick={onNext}>Дальше →</button>}{' '}
        <button onClick={onRetry}>С чистого листа</button>{' '}
        <button onClick={onExit}>Меню</button></p>
    </div></div>
  )
}

function Reward({ r }) {
  if (!r) return null
  return (
    <p>
      {r.xp_gained > 0 && <b className="good">+{r.xp_gained} XP · уровень {r.level}</b>}
      {r.achievements.map(a => <span key={a.code}><br />🏆 <b>{a.title}</b> — {a.desc}</span>)}
    </p>
  )
}
