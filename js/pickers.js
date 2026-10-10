// Menus déroulants (roue iOS) partagés par la saisie des séances et le volet nutrition.
import * as U from "./util.js";

// Les options ne sont générées qu'au premier toucher pour garder une page légère.
// "Autre…" bascule en saisie clavier.
export const OTHER = "__autre";
const DISTANCES = [10, 20, 25, 30, 40, 50, 60, 75, 80, 100, 120, 150, 200, 250, 300, 400, 500,
  600, 750, 800, 1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000, 21100];
export const range = (a, b, step) => Array.from({ length: Math.round((b - a) / step) + 1 }, (_, i) => Math.round((a + i * step) * 100) / 100);
const PICK_VALUES = {
  reps: () => range(1, 100, 1),
  weight_kg: () => range(0, 300, 0.5),
  speed_kmh: () => range(5, 25, 0.1),
  distance_m: () => DISTANCES,
  // Temps = deux roues (minutes / secondes) : précision à la seconde sur toute durée.
  dur_min: () => range(0, 240, 1),
  dur_sec: () => range(0, 59, 1),
  // Nutrition, corps, sommeil
  portions: () => range(0.25, 4, 0.25),
  grammes: () => [...range(5, 100, 5), ...range(110, 500, 10), ...range(525, 1500, 25)],
  kcal: () => range(0, 2000, 10),
  macro_g: () => range(0, 300, 1),
  poids_kg: () => range(35, 150, 0.1),
  gras_pct: () => range(3, 45, 0.1),
  muscle_kg: () => range(15, 90, 0.1),
  score: () => range(0, 100, 1),
  heures: () => range(0, 14, 1),
  minutes_phase: () => range(0, 300, 5),
};
export const pickLabel = (key, v) => (key === "dur_sec" ? U.pad(v) : String(v).replace(".", ","));
const optionsCache = {};
function pickOptions(key) {
  optionsCache[key] ??= `<option value="">—</option>`
    + PICK_VALUES[key]().map((v) => `<option value="${v}">${pickLabel(key, v)}</option>`).join("")
    + (key.startsWith("dur_") || key === "heures" ? "" : `<option value="${OTHER}">Autre…</option>`);
  return optionsCache[key];
}

export function fillPicker(sel) {
  if (sel.dataset.filled) return;
  const v = sel.dataset.v;
  const key = sel.dataset.pick || sel.dataset.m;
  sel.innerHTML = pickOptions(key);
  if (v !== "" && ![...sel.options].some((o) => o.value === v)) {
    sel.add(new Option(pickLabel(key, Number(v)), v), sel.options[1]);
  }
  sel.value = v;
  sel.dataset.filled = "1";
}

export function textInput(m, v) {
  const val = m === "duration_s" ? U.fmtDuration(v) : (v ?? "");
  return `<input class="num" data-m="${m}" value="${U.esc(val)}" placeholder="${m === "duration_s" ? "mm:ss" : ""}"
    inputmode="decimal" autocomplete="off" enterkeyhint="done">`;
}

export function durationInput(v) {
  const has = v != null;
  const mins = has ? Math.floor(v / 60) : "";
  const secs = has ? Math.round(v % 60) : "";
  const wheel = (part, val, label) => `<select class="num pick ${has ? "" : "empty"}" data-m="duration_s"
    data-pick="dur_${part}" data-v="${val}"><option value="${val}" selected>${label}</option></select>`;
  return `<div class="dur">${wheel("min", mins, has ? mins : "—")}<span>:</span>${wheel("sec", secs, has ? U.pad(secs) : "—")}</div>`;
}

// Menu générique : <select class="num pick" data-pick="<clé>">. Les attributs data-* en plus
// servent à retrouver le champ à mettre à jour.
export function picker(key, value, attrs = {}) {
  const v = value ?? "";
  const data = Object.entries(attrs).map(([k, x]) => `data-${k}="${U.esc(x)}"`).join(" ");
  return `<select class="num pick ${v === "" ? "empty" : ""}" data-pick="${key}" data-v="${v}" ${data}>
    <option value="${v}" selected>${v === "" ? "—" : pickLabel(key, v)}</option></select>`;
}
