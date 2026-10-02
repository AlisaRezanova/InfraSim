// Ядро симуляции: чистая логика без DOM/React.

// ================= ЯДРО СИМУЛЯЦИИ (без DOM) =================
export const NT = {
  src:   { name:'Пользователи', icon:'👥', cap:1e12, cost:0,  lat:0,  desc:'Источник трафика. К нему можно подключить только одну точку входа.' },
  lb:    { name:'Балансировщик',icon:'⚖️', cap:8000,  cost:20, lat:1,  desc:'Раздаёт запросы по живым потомкам пропорционально их мощности. Пропускает 8000 запр/с.' },
  cdn:   { name:'CDN',          icon:'🌐', cap:50000, cost:30, lat:3,  hit:0.7, desc:'Отдаёт 70% чтений из ближайшей точки, не доводя до серверов. Записи пропускает дальше.' },
  app:   { name:'Сервер',       icon:'🖥️', cap:500,   cost:12, lat:10, desc:'Обрабатывает запросы (500/с). Чтения шлёт в кэш (или БД), записи — в очередь (или БД).' },
  cache: { name:'Кэш',          icon:'⚡', cap:20000, cost:25, lat:2,  hit:0.8, desc:'80% чтений отдаёт мгновенно, остальные (промахи) и все записи идут в БД.' },
  db:    { name:'База данных',  icon:'🗄️', cap:500,   cost:50, lat:25, desc:'Медленная, но надёжная. Чтение = 1 единица нагрузки, запись = 2. Ёмкость 500.' },
  queue: { name:'Очередь',      icon:'📬', cap:10000, cost:15, lat:3,  buf:20000, desc:'Мгновенно подтверждает запись и копит в буфере (20 000). Разбирают её воркеры.' },
  worker:{ name:'Воркер',       icon:'⚙️', cap:300,   cost:10, lat:0,  desc:'Забирает записи из очереди (300/с) и складывает в БД.' },
  redis: { name:'Redis',        icon:'🔴', cap:40000, cost:40, lat:1,  hit:0.9, desc:'Быстрый кэш в памяти: отдаёт 90% чтений и почти не добавляет задержки. Дороже обычного кэша.' },
  replica:{name:'Реплика БД',   icon:'📑', cap:500,   cost:35, lat:20, desc:'Копия БД только для чтения (500/с). Записи не принимает — они должны идти в основную БД.' },
  nosql: { name:'NoSQL',        icon:'🍃', cap:1200,  cost:70, lat:15, desc:'Быстрее и ёмче обычной БД (1200/с), запись стоит 1 единицу, а не 2. Но заметно дороже.' },
  kafka: { name:'Kafka',        icon:'📨', cap:50000, cost:60, lat:4,  buf:200000, desc:'Очередь-гигант: буфер 200 000 и 50 000 запр/с. Для больших шквалов записей, но дороже обычной очереди.' },
  lambda:{ name:'Serverless',   icon:'λ',  cap:3000,  cost:2,  lat:25, desc:'Сервер «по требованию»: платите за фактическую нагрузку (дёшево при малом трафике), но каждый запрос медленнее из-за холодного старта. Не падает при отказах серверов.' },
};
export const TIER_CAP = [1, 2, 4], TIER_COST = [1, 1.8, 3.2];
const ALL = ['lb','cdn','app','lambda','cache','redis','db','replica','nosql','queue','kafka','worker'];
// Роли компонентов: по ним работает маршрутизация.
const CACHES = ['cache','redis'], STORES = ['db','nosql'], QUEUES = ['queue','kafka'];
const LAMBDA_PER_RPS = 0.03;

// ---- Зоны доступности ----
// Зона узла определяется по y на холсте: верх (A) = 0, низ (B) = 1.
export const ZONE_SPLIT_Y = 280;
export const zoneOf = n => n.y < ZONE_SPLIT_Y ? 0 : 1;
// Типы, которые можно сделать мультизонными (живут в обеих зонах, x2 стоимость).
export const MULTI_OK = ['lb','cache','redis','db','nosql','queue','kafka'];
export function setMulti(n, on) { if (MULTI_OK.includes(n.type)) n.multi = !!on; }
// Лимит соединений БД/NoSQL.
export const MAXCONN = { min:20, max:400, step:20, def:120 };
const CROSS_LAT = 3; // мс за пересечение границы зон
const NODE_DEFAULTS = () => ({ multi:false, cross:true, maxConn:MAXCONN.def });
// Идёт ли сейчас отказ зоны z (по событиям уровня и времени).
export const zoneDown = z => !!G && G.level.events.some(ev => ev.type==='zone' && ev.zone===z && G.time>=ev.from && G.time<ev.to);
const anyZoneDown = () => zoneDown(0) || zoneDown(1);
// Пересекает ли связь границу зон. src и мультизонные узлы «в одной зоне с кем угодно».
const crossZone = (a, b) => a.type!=='src' && b.type!=='src' && !a.multi && !b.multi && zoneOf(a)!==zoneOf(b);
// Размер пула соединений, который держит родитель на хранилище.
const POOL = n => n.type==='app' ? 20 : n.type==='worker' ? 10 : n.type==='lambda' ? 5 + Math.ceil((n.units||0)/50) : 0;
// Пороги для ачивок «Всё нормально» и «Переусложнил».
const HOT_UTIL = 0.9, OVER_COST = 300, OVER_RPS = 200;


export let G = null;
const B = () => ({ r:0, w:0, lr:0, lw:0 });
const tot = b => b.r + b.w;
const addTo = (t, b, k=1) => { t.r+=b.r*k; t.w+=b.w*k; t.lr+=b.lr*k; t.lw+=b.lw*k; };
const scaled = (b, k) => { const o=B(); addTo(o,b,k); return o; };

function rng(seed) { let s=seed>>>0; return () => (s = (s*1664525+1013904223)>>>0) / 4294967296; }

export function newGame(mode, levelIdx, levelDef) {
  const lvl = mode==='level' ? levelDef : mode==='survival'
    ? { name:'Выживание', story:'Нагрузка растёт, инциденты учащаются. Продержитесь как можно дольше.', dur:Infinity, rps:300, ratio:0.85, stateful:true, allowed:ALL, goal:null, events:genSurvival() }
    : { name:levelDef?.name ?? 'Песочница', story:levelDef?.story ?? 'Стройте что угодно. Нагрузку задают ползунки сверху.', dur:Infinity,
        rps:levelDef?.rps ?? 500, ratio:levelDef?.ratio ?? 0.8, stateful:levelDef?.stateful ?? true, allowed:ALL, goal:null, events:levelDef?.events ?? [] };
  G = { mode, levelIdx, level:lvl, nodes:[{id:0,type:'src',x:80,y:280,tier:0,downUntil:0,in:null,util:0,...NODE_DEFAULTS()}], edges:[], nextId:1,
        time:0, running:false, done:null, costInt:0, bad:0, failT:0, sandRps:lvl.rps, sandRatio:lvl.ratio,
        m:{rps:0,err:0,lat:0,cost:0}, evState:lvl.events.map(()=>({hit:null})), ...freshStats() };
  return G;
}
// Метрики прохождения: по ним считаются p95, рекорды и ачивки.
function freshStats() { return { lats:[], maxRps:0, hot:0, hotBest:0, over:0, overBest:0 }; }
function recordStats(dt) {
  const m = G.m;
  G.maxRps = Math.max(G.maxRps, m.rps*(1-m.err));
  if (m.lat > 0) G.lats.push(m.lat);
  const hot = m.err <= 0.05 && G.nodes.some(n => n.type!=='src' && alive(n) && n.util >= HOT_UTIL);
  G.hot = hot ? G.hot+dt : 0; G.hotBest = Math.max(G.hotBest, G.hot);
  const over = m.cost >= OVER_COST && m.rps < OVER_RPS;
  G.over = over ? G.over+dt : 0; G.overBest = Math.max(G.overBest, G.over);
}
function p95() {
  if (!G.lats.length) return 0;
  const a = [...G.lats].sort((x,y)=>x-y);
  return a[Math.floor(0.95*(a.length-1))];
}
function genSurvival() {
  const r = rng(12345), ev = [];
  const rz = rng(777); // отдельный генератор: не сдвигает остальные события
  for (let t=15; t<1200; t+=10+r()*10) {
    const k = r();
    if (t>=60 && rz()<0.15) ev.push({from:t,to:t+10,type:'zone',zone:rz()<0.5?0:1});
    else if (k<0.4) ev.push({from:t,to:t+8,type:'spike',mult:1.6+r()*1.2});
    else if (k<0.75) ev.push({from:t,to:t+12,type:'crash',target:r()<.6?'app':'db'});
    else ev.push({from:t,to:t+10,type:'writes',ratio:0.4});
  }
  return ev;
}
export const nodeById = id => G.nodes.find(n=>n.id===id);
export const alive = n => n.type==='src' || (n.downUntil <= G.time && (n.multi || !zoneDown(zoneOf(n))));
// Мультизонный узел при отказе любой зоны работает вполсилы.
export const capOf = n => !alive(n) ? 0 : NT[n.type].cap * TIER_CAP[n.tier] * (n.multi && n.type!=='src' && anyZoneDown() ? 0.5 : 1);
// Соединения, занятые на хранилище n: пулы ВСЕХ подключённых родителей (живых и упавших —
// детерминированно, пул резервируется при подключении). app=20, worker=10, lambda=5+ceil(units/50).
export function connsUsed(n) {
  return G.edges.filter(e=>e.b===n.id).reduce((x,e)=>x+POOL(nodeById(e.a)), 0);
}
export const nodeCost = n => {
  if (n.type==='lambda') return NT.lambda.cost + (n.units||0)*LAMBDA_PER_RPS * (n.multi?2:1);   // платим за фактическую нагрузку
  const base = NT[n.type].cost * TIER_COST[n.tier];
  let c = base * (n.multi ? 2 : 1);
  if (STORES.includes(n.type)) c = Math.max(c + ((n.maxConn ?? MAXCONN.def) - MAXCONN.def)*0.05, base*0.5);
  return c;
};
const kidsOf = n => G.edges.filter(e=>e.a===n.id).map(e=>({n:nodeById(e.b), e}));

function reaches(from, to) { // есть ли путь from -> to
  const seen = new Set([from]), st=[from];
  while (st.length) { const x=st.pop(); if (x===to) return true;
    for (const e of G.edges) if (e.a===x && !seen.has(e.b)) { seen.add(e.b); st.push(e.b); } }
  return false;
}
export function addNode(type, x, y) {
  if (!G.level.allowed.includes(type)) return null;
  const n = { id:G.nextId++, type, x, y, tier:0, downUntil:0, backlog:0, in:null, util:0, ...NODE_DEFAULTS() };
  G.nodes.push(n); return n;
}
export function connect(a, b) {
  if (a===b || b===0) return 'no';
  if (G.edges.some(e=>e.a===a&&e.b===b)) return 'dup';
  if (a===0 && G.edges.some(e=>e.a===0)) return 'src1';
  if (reaches(b, a)) return 'cycle';
  G.edges.push({a, b, rate:0}); return 'ok';
}
export function removeNode(id) { if (id===0) return; G.nodes=G.nodes.filter(n=>n.id!==id); G.edges=G.edges.filter(e=>e.a!==id&&e.b!==id); }
export function upgrade(n) { if (n.tier<2 && n.type!=='src') n.tier++; }

function topo() {
  const indeg = new Map(G.nodes.map(n=>[n.id,0]));
  G.edges.forEach(e=>indeg.set(e.b, indeg.get(e.b)+1));
  const q = G.nodes.filter(n=>indeg.get(n.id)===0), out=[];
  while (q.length) { const n=q.shift(); out.push(n);
    for (const e of G.edges) if (e.a===n.id) { indeg.set(e.b, indeg.get(e.b)-1); if (indeg.get(e.b)===0) q.push(nodeById(e.b)); } }
  return out;
}

export function currentLoad() {
  const L = G.level;
  let rps = G.mode==='sandbox' ? G.sandRps : L.rps, ratio = G.mode==='sandbox' ? G.sandRatio : L.ratio;
  if (G.mode==='survival') rps = 300 + 35*G.time;
  L.events.forEach(ev => { if (G.time>=ev.from && G.time<ev.to) {
    if (ev.type==='spike') rps*=ev.mult; else if (ev.type==='writes') ratio=ev.ratio; } });
  return { rps, ratio };
}
function applyEvents() {
  G.level.events.forEach((ev,i) => {
    if (ev.type!=='crash' || G.time<ev.from || G.time>=ev.to) return;
    const st = G.evState[i];
    if (st.hit===null) {
      const types = ev.target==='db' ? STORES : [ev.target];
      const c = G.nodes.filter(n=>types.includes(n.type) && alive(n));
      st.hit = c.length ? c[0].id : -1;
      if (st.hit>=0) nodeById(st.hit).downUntil = ev.to;
    }
  });
}

function route(targets, s, a, M, from) {
  if (from && from.type==='lb' && from.cross===false) { // без межзонной балансировки: только своя зона (мультизонные дети доступны)
    const z = zoneOf(from); targets = targets.filter(t=>t.n.multi || zoneOf(t.n)===z);
  }
  targets = targets.filter(t=>alive(t.n));
  const T = tot(s)+tot(a); if (T<=0) return;
  if (!targets.length) { M.err += T; return; }
  const ws = targets.map(t=>capOf(t.n)), sum = ws.reduce((x,y)=>x+y,0);
  targets.forEach((t,i)=>{ const k=ws[i]/sum, ss=scaled(s,k), aa=scaled(a,k);
    if (from && crossZone(from, t.n)) { ss.lr += ss.r*CROSS_LAT; ss.lw += ss.w*CROSS_LAT; aa.lr += aa.r*CROSS_LAT; aa.lw += aa.w*CROSS_LAT; }
    addTo(t.n.in.s, ss); addTo(t.n.in.a, aa); t.e.rate += (tot(ss)+tot(aa)); });
}

function proc(n, dt, M) {
  const def = NT[n.type], s = n.in.s, a = n.in.a;
  if (n.type==='replica') { M.err += s.w + a.w; s.w = a.w = s.lw = a.lw = 0; } // реплика не принимает записи
  if (STORES.includes(n.type)) { // лимит соединений: лишние запросы не принимаются
    const used = connsUsed(n), mx = n.maxConn ?? MAXCONN.def;
    if (used > mx) { const k = mx/used; M.err += (tot(s)+tot(a))*(1-k); addTo(s,s,k-1); addTo(a,a,k-1); }
  }
  const wc = n.type==='db' ? 2 : 1;
  const units = s.r + a.r + (s.w + a.w)*wc;
  n.units = units;
  const cap = capOf(n);
  n.util = cap>0 ? units/cap : (units>0 ? 9 : 0);
  const acc = units<=0 ? 1 : Math.min(1, cap/units);
  M.err += (tot(s)+tot(a))*(1-acc);
  const u = Math.min(n.util, 1.2), L = def.lat*(1+2*u*u*u*u);
  const S = scaled(s,acc), A = scaled(a,acc);
  S.lr += S.r*L; S.lw += S.w*L;
  const all = kidsOf(n);
  switch (n.type) {
    case 'lb': route(all, S, A, M, n); break;
    case 'cdn': {
      const h = def.hit;
      M.comp.r += S.r*h; M.comp.lr += S.lr*h;
      route(all, { r:S.r*(1-h), w:S.w, lr:S.lr*(1-h), lw:S.lw }, A, M, n);
      break; }
    case 'cache': case 'redis': {
      const h = def.hit;
      M.comp.r += S.r*h; M.comp.lr += S.lr*h;
      // промахи читаются из реплик/БД, записи идут только в основное хранилище
      const readDb = all.filter(k=>k.n.type==='replica' || STORES.includes(k.n.type));
      route(readDb, { r:S.r*(1-h), w:0, lr:S.lr*(1-h), lw:0 }, B(), M, n);
      route(all.filter(k=>STORES.includes(k.n.type)), { r:0, w:S.w, lr:0, lw:S.lw }, A, M, n);
      break; }
    case 'app': case 'lambda': {
      const caches=all.filter(k=>CACHES.includes(k.n.type)), stores=all.filter(k=>STORES.includes(k.n.type)),
            reps=all.filter(k=>k.n.type==='replica'), qs=all.filter(k=>QUEUES.includes(k.n.type));
      const readDb = reps.concat(stores);
      if (!caches.length && !readDb.length && !qs.length) {
        if (all.length) route(all, S, A, M, n);
        else if (!G.level.stateful) addTo(M.comp, S);
        else M.err += tot(S)+tot(A);
        break;
      }
      route(caches.length?caches:readDb.length?readDb:qs, { r:S.r, w:0, lr:S.lr, lw:0 }, B(), M, n);
      route(qs.length?qs:stores.length?stores:caches.length?caches:reps, { r:0, w:S.w, lr:0, lw:S.lw }, B(), M, n);
      break; }
    case 'queue': case 'kafka': {
      addTo(M.comp, { r:0, w:S.w, lr:0, lw:S.lw });
      M.err += S.r;
      const workers = all.filter(k=>k.n.type==='worker');
      const drainCap = workers.reduce((x,k)=>x+capOf(k.n),0);
      const avail = n.backlog/dt + S.w;
      const drain = Math.min(avail, drainCap);
      n.backlog += (S.w - drain)*dt;
      if (n.backlog<0) n.backlog=0;
      if (n.backlog>def.buf) { M.err += (n.backlog-def.buf)/dt; n.backlog=def.buf; }
      if (drain>0) route(workers, B(), { r:0, w:drain, lr:0, lw:0 }, M, n);
      break; }
    case 'worker': { const st = all.filter(k=>STORES.includes(k.n.type)); route(st.length?st:all, B(), A, M, n); break; }
    case 'db': case 'nosql': case 'replica': addTo(M.comp, S); break;
  }
}

function simulate(dt) {
  const M = { err:0, comp:B() }, { rps, ratio } = currentLoad();
  G.nodes.forEach(n=>{ n.in={s:B(),a:B()}; n.util=0; });
  G.edges.forEach(e=>e.rate=0);
  const src = G.nodes[0];
  route(kidsOf(src), { r:rps*ratio, w:rps*(1-ratio), lr:0, lw:0 }, B(), M, src);
  topo().forEach(n=>{ if (n.type!=='src') proc(n, dt, M); });
  const done = tot(M.comp);
  G.m = { rps, err: rps>0 ? Math.min(1, M.err/rps) : 0, lat: done>0 ? (M.comp.lr+M.comp.lw)/done : 0,
          cost: G.nodes.reduce((x,n)=>x+nodeCost(n),0) };
}

export function step(dt) {
  applyEvents();
  simulate(dt);
  if (!G.running) return;
  const g = G.level.goal, m = G.m;
  G.time += dt; G.costInt += m.cost*dt;
  recordStats(dt);
  if (g) {
    if (m.err > g.err || m.lat > g.lat) G.bad += dt;
    if (G.time >= G.level.dur) finish();
  } else if (G.mode==='survival') {
    G.failT = m.err>0.3 ? G.failT+dt : 0;
    if (G.failT>=5) finish();
  }
}
function finish() {
  G.running = false;
  const stats = { p95:p95(), maxRps:G.maxRps, hotBest:G.hotBest, overBest:G.overBest };
  if (G.mode==='survival') { G.done = { survival:true, secs:Math.floor(G.time), ...stats }; return; }
  const g=G.level.goal, avg=G.costInt/G.level.dur, badFrac=G.bad/G.level.dur;
  const pass = badFrac<=0.1 && avg<=g.cost;
  let stars = 0;
  if (pass) { stars=1; if (avg<=g.cost*0.8) stars=2; if (avg<=g.cost*0.65 && badFrac<=0.02) stars=3; }
  G.done = { pass, stars, avg, badFrac, ...stats };
}


export function resetRun() {
  G.time = 0; G.running = false; G.costInt = 0; G.bad = 0; G.failT = 0; G.done = null; Object.assign(G, freshStats());
  G.nodes.forEach(n => { n.downUntil = 0; n.backlog = 0; });
  G.evState = G.level.events.map(() => ({ hit: null }));
}
export function kids(n) { return kidsOf(n); }
