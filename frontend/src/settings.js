// Локальные настройки игрока (localStorage может быть недоступен — тогда берём значения по умолчанию).
export function load(key, def) {
  try { return localStorage.getItem('infrasim_' + key) ?? def } catch { return def }
}
export function save(key, value) {
  try { localStorage.setItem('infrasim_' + key, value) } catch { /* ignore */ }
}
