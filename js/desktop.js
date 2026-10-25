// Vue ordinateur (desktop.html) : lecture seule.
// Saison › Mois › Semaine › Séance, plus Analyses. Mêmes données et même token que l'app mobile
// (store.js), aucune écriture dans hyrox-data.
import { Store, StoreError, loadConfig, saveConfig } from "./store.js";
import * as U from "./util.js";
import { ingestNutrition, dayMacros, target as dayTarget, BALANCES } from "./nutrition.js";

// ---------------------------------------------------------------- état global

const S = {
  cfg: loadConfig(),
  store: null,
  ex: new Map(),
  plan: { sessions: [] },
  logs: [],
  profil: null,
  objectifs: null,
  nut: null,
  proj: { semaines: [] }, // plan/projection.json : semaines types non validées
  loaded: false,
  error: "",
  // Dernières positions visitées : les onglets Mois / Semaine / Séance y reviennent.
  pos: { month: null, week: null, seance: null },
  show: { sleep: true, food: true, warm: false }, // warm : échauffements comptés dans le volume par station
  analysisEx: null,
  stFrom: null, // départ du volume par station : id d'une course officielle, ou "28j"
  grain: "jour", // regroupement de la section sommeil / nutrition : jour, semaine, mois
};

const TYPE_LABEL = {
  course: "Course", muscu: "Muscu", hyrox: "Hyrox", foot: "Foot", repos: "Repos",
  test: "Test", mobilite: "Mobilité", course_officielle: "Course officielle", autre: "Autre",
};
const TYPE_COLOR = {
  hyrox: "#f5e400", course_officielle: "#f5e400", course: "#4fd1c5", muscu: "#a78bfa", test: "#a78bfa",
  foot: "#ff9f5a", autre: "#7d8592", mobilite: "#7d8592", repos: "#4a505c",
};
// Groupes du volume hebdo (repos exclu).
const GROUPS = [
  ["hy", "Hyrox + courses", "#f5e400", ["hyrox", "course_officielle"]],
  ["co", "Course", "#4fd1c5", ["course"]],
  ["mu", "Muscu", "#a78bfa", ["muscu", "test"]],
  ["fo", "Foot", "#ff9f5a", ["foot"]],
  ["au", "Autre (padel, mobilité…)", "#7d8592", ["autre", "mobilite"]],
];
const groupOf = (type) => GROUPS.find((g) => g[3].includes(type))?.[0] || null;
const STATUS_LABEL = { fait: "Faite", modifie: "Modifiée", saute: "Sautée" };
const STATUS_COLOR = { fait: "#57d68d", modifie: "#ffb547", saute: "#9097a3" };
const MOIS_COURT = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const $view = document.getElementById("dview");
const esc = U.esc;
const today = () => U.isoDate();
const fr = (n, d = 0) => Number(n).toLocaleString("fr-FR", { maximumFractionDigits: d });
const exName = (id) => S.ex.get(id)?.name || id;

// ---------------------------------------------------------------- chargement

async function loadAll() {
  if (!S.cfg.token) {
    S.loaded = false;
    location.hash = "#/reglages";
    render();
    return;
  }
  setSync("Synchronisation…", "");
  try {
    S.store = new Store(S.cfg);
    const files = await S.store.listFiles();
    const core = ["catalogue/exercices.json", "plan/plan.json", "profil/athlete.json", "profil/objectifs.json"];
    const logFiles = files.filter((p) => p.startsWith("logs/") && p.endsWith(".json"));
    const nutFiles = files.filter((p) => p.startsWith("nutrition/") && p.endsWith(".json"));
    const extra = files.includes("plan/projection.json") ? ["plan/projection.json"] : [];
    const data = await S.store.readMany([...core, ...extra, ...logFiles, ...nutFiles]);
    ingestNutrition(S, data, nutFiles);
    const cat = data.get(core[0]) || { exercices: [] };
    S.ex = new Map(cat.exercices.map((e) => [e.id, e]));
    S.plan = data.get(core[1]) || { sessions: [] };
    S.profil = data.get(core[2]);
    S.objectifs = data.get(core[3]);
    S.proj = data.get("plan/projection.json") || { semaines: [] };
    S.logs = logFiles.map((p) => data.get(p)).filter(Boolean)
      .sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
    S.loaded = true;
    S.error = "";
    const t = new Date();
    setSync(S.store.offline ? "Hors ligne — dernières données connues"
      : `Synchronisé · ${S.logs.length} séances · ${U.pad(t.getHours())}:${U.pad(t.getMinutes())}`, S.store.offline ? "err" : "ok");
  } catch (e) {
    console.error(e);
    S.error = e instanceof StoreError ? e.message : "Impossible de joindre GitHub.";
    setSync(S.error, "err");
  }
  render();
}

function setSync(msg, cls) {
  document.getElementById("dsync-txt").textContent = msg;
  document.getElementById("dsync-dot").className = "dot " + cls;
}

// ---------------------------------------------------------------- données dérivées

const plannedDone = () => new Set(S.logs.map((l) => l.plan_id).filter(Boolean));
const planById = (id) => S.plan.sessions.find((s) => s.id === id);

// Projection : utilisée seulement pour une semaine à venir où le coach n'a encore rien programmé.
const weekHasPlan = (monday) => S.plan.sessions.some((s) => s.date >= monday && s.date <= U.addDays(monday, 6));
function projWeek(monday) {
  if (U.addDays(monday, 6) < today() || weekHasPlan(monday)) return null;
  return (S.proj.semaines || []).find((w) => w.lundi === monday) || null;
}

// Séances d'un jour : réalisées (logs) + prévues (plan) pas encore loguées, sinon projection.
function sessionsOn(iso) {
  const done = plannedDone();
  const logs = S.logs.filter((l) => l.date === iso).map((s) => ({ s, log: true }));
  const ids = new Set(logs.map((x) => x.s.id));
  const plans = S.plan.sessions
    .filter((p) => p.date === iso && !done.has(p.id) && !ids.has(p.id))
    .map((s) => ({ s, log: false }));
  const proj = iso < today() ? [] : (projWeek(U.mondayOf(iso))?.seances || [])
    .filter((p) => p.date === iso).map((s) => ({ s, log: false, proj: true }));
  return [...logs, ...plans, ...proj];
}

// Minutes prévues d'une semaine par groupe : plan du coach, sinon projection.
function plannedStats(monday) {
  const sunday = U.addDays(monday, 6);
  const pw = projWeek(monday);
  const list = pw ? pw.seances || [] : S.plan.sessions.filter((s) => s.date >= monday && s.date <= sunday && s.date >= today());
  const byGroup = Object.fromEntries(GROUPS.map((g) => [g[0], 0]));
  for (const s of list) { const g = groupOf(s.type); if (g) byGroup[g] += Number(s.duration_min) || 0; }
  return { byGroup, total: Object.values(byGroup).reduce((a, b) => a + b, 0), proj: !!pw };
}

const minutes = (s) => (s.status === "saute" ? 0 : Number(s.duration_min) || 0);

function fmtMin(m) {
  m = Math.round(m);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${U.pad(m % 60)}`;
}

const sleepOf = (iso) => S.nut?.sommeil.get(iso) || null;

function foodOf(iso) {
  const j = S.nut?.journal.get(iso);
  if (!j) return null;
  const m = dayMacros(S.nut, j);
  const t = dayTarget(S, iso);
  return { m, t, ratio: t?.kcal ? m.kcal / t.kcal : null };
}

const foodColor = (r) => (r == null ? "var(--muted)" : r >= 0.9 && r <= 1.1 ? "var(--ok)" : "var(--warn)");
const sleepColor = (s) => (s == null ? "var(--muted)" : s >= 85 ? "var(--ok)" : s < 70 ? "var(--danger)" : "var(--text)");

// Le champ "pain" sert aussi aux ressentis : on ne signale que les vraies douleurs.
const PAIN_BAD = /douleur|douloureu|gêne|gene|inconfort|contusion|contract|coup |boiterie|⚠️/i;
const PAIN_OK = /aucune douleur|sans douleur|\bok\b|✅|✓|\bras\b|rien de particulier|aucun souci/i;
const painLevel = (l) => (!l.pain ? null : PAIN_BAD.test(l.pain) && !PAIN_OK.test(l.pain) ? "bad" : "info");

// "1h33:15" ou "1:12:02" dans le commentaire d'une course officielle.
function raceTime(l) {
  for (const t of [l.comment, l.text, l.title]) {
    const m = String(t || "").match(/\b(\d)h(\d{2}):(\d{2})\b|\b(\d):(\d{2}):(\d{2})\b/);
    if (m) return m[1] ? `${m[1]}:${m[2]}:${m[3]}` : `${m[4]}:${m[5]}:${m[6]}`;
  }
  return l.duration_min ? fmtMin(l.duration_min) : "";
}
const raceName = (l) => {
  const w = l.title.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\bhyrox\b/i, " ").trim().split(/\s+/)[0] || "Course";
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
};

function weekPhase(monday) {
  const sunday = U.addDays(monday, 6);
  if (U.mondayOf(today()) === monday && S.plan.semaine) return S.plan.semaine;
  const counts = new Map();
  for (const l of S.logs) if (l.phase && l.date >= monday && l.date <= sunday) counts.set(l.phase, (counts.get(l.phase) || 0) + 1);
  const best = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (best) return best;
  const pw = projWeek(monday);
  if (pw?.label) return pw.label;
  const ph = phaseAt(monday);
  return ph ? ph.nom : "";
}

const phases = () => (S.objectifs?.phases || []).slice().sort((a, b) => a.debut.localeCompare(b.debut));
const phaseAt = (iso) => phases().find((p) => p.debut <= iso && iso <= p.fin) || null;

function weekStats(monday) {
  const sunday = U.addDays(monday, 6);
  const logs = S.logs.filter((l) => l.date >= monday && l.date <= sunday);
  const byGroup = Object.fromEntries(GROUPS.map((g) => [g[0], 0]));
  for (const l of logs) { const g = groupOf(l.type); if (g) byGroup[g] += minutes(l); }
  const total = Object.values(byGroup).reduce((a, b) => a + b, 0);
  return { logs, byGroup, total };
}

const shortTitle = (t) => String(t || "").replace(/^🏁\s*/, "").split(" — ")[0];

// ---------------------------------------------------------------- petits composants

const sw = (c) => `<span class="sw" style="background:${c}"></span>`;
const legend = () => `<div class="legend">${GROUPS.map((g) => `<span>${sw(g[2])}${esc(g[1])}</span>`).join("")}</div>`;

function splitBar(parts) {
  const tot = parts.reduce((a, p) => a + p.v, 0) || 1;
  return `<div class="split">${parts.filter((p) => p.v > 0)
    .map((p) => `<div title="${esc(p.label)} : ${fmtMin(p.v)}" style="width:${(p.v / tot) * 100}%;background:${p.c}"></div>`).join("")}</div>`;
}

function groupSplit(byGroup) {
  const parts = GROUPS.map((g) => ({ v: byGroup[g[0]], c: g[2], label: g[1] }));
  const items = GROUPS.filter((g) => byGroup[g[0]] > 0)
    .map((g) => `<span>${sw(g[2])}<strong>${fmtMin(byGroup[g[0]])}</strong>&nbsp;${esc(g[1].toLowerCase())}</span>`).join("");
  return `${splitBar(parts)}<div class="legend">${items || "Aucun volume"}</div>`;
}

// Courbe SVG simple : valeurs + dernier point en évidence.
function lineChart(points, color, { lo, hi } = {}) {
  if (points.length < 2) return `<p class="empty">Pas assez de séances pour tracer une courbe.</p>`;
  const vals = points.map((p) => p.v);
  lo ??= Math.min(...vals); hi ??= Math.max(...vals);
  if (hi === lo) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.15;
  lo -= pad; hi += pad;
  const n = points.length;
  const xy = points.map((p, i) => [Math.round(12 + i * (336 / (n - 1))), Math.round(118 - ((p.v - lo) / (hi - lo)) * 106)]);
  const label = `${points[0].v} → ${points[n - 1].v}`;
  const vmin = Math.min(...vals), vmax = Math.max(...vals);
  return `<div class="chart"><svg viewBox="0 0 360 130" role="img" aria-label="${esc(label)}">
    <polyline points="${xy.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></polyline>
    ${xy.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === n - 1 ? 5 : 3}" fill="${i === n - 1 ? color : "#121418"}" stroke="${color}" stroke-width="2"><title>${esc(points[i].label)} : ${fr(points[i].v, 1)}</title></circle>`).join("")}
  </svg><div class="xs muted" style="text-align:right">min ${fr(vmin, 1)} · max ${fr(vmax, 1)}</div></div>`;
}

function chip(x) {
  const s = x.s;
  const race = s.type === "course_officielle";
  if (x.proj) {
    return `<span class="chip proj" title="Projection non validée${s.note ? " — " + esc(s.note) : ""}">
      <span class="t">${sw(TYPE_COLOR[s.type] || "#7d8592")}<span>${esc(shortTitle(s.title))}</span></span>
      <span class="m">${esc(["projection", s.duration_min ? `${s.duration_min} min` : ""].filter(Boolean).join(" · "))}</span></span>`;
  }
  const cls = ["chip", x.log ? "" : "plan", race ? "race" : "", s.status === "saute" ? "saute" : ""].join(" ");
  let meta;
  if (!x.log) meta = ["prévu", s.duration_min ? `${s.duration_min} min` : ""].filter(Boolean).join(" · ");
  else if (s.status === "saute") meta = "sautée";
  else if (race) meta = [raceTime(s), s.rpe != null ? `RPE ${fr(s.rpe, 1)}` : ""].filter(Boolean).join(" · ");
  else meta = [s.duration_min ? `${s.duration_min} min` : "", s.rpe != null ? `RPE ${fr(s.rpe, 1)}` : ""].filter(Boolean).join(" · ");
  return `<a class="${cls}" href="#/seance/${encodeURIComponent(s.id)}" title="${esc(s.title)}">
    <span class="t">${sw(TYPE_COLOR[s.type] || "#7d8592")}<span>${esc(shortTitle(s.title))}</span></span>
    <span class="m">${esc(meta)}</span></a>`;
}

function crumb(parts) {
  return `<div class="crumb">${parts.map(([label, href]) => (href ? `<a href="${href}">${esc(label)}</a>` : esc(label))).join(" › ")}</div>`;
}

const monthOf = (iso) => iso.slice(0, 7);
const monthHref = (iso) => `#/mois/${monthOf(iso)}`;
const weekHref = (iso) => `#/semaine/${U.mondayOf(iso)}`;

// ---------------------------------------------------------------- vue Saison

function seasonRange() {
  const ph = phases();
  const end = S.objectifs?.course?.date || ph.at(-1)?.fin || U.addDays(today(), 60);
  const yearAgo = U.addDays(end, -330);
  const races = S.logs.filter((l) => l.type === "course_officielle" && l.date >= yearAgo && l.date <= end);
  const starts = [ph[0]?.debut, races[0]?.date].filter(Boolean).sort();
  return { start: starts[0] || U.addDays(today(), -120), end, races };
}

function viewSaison() {
  const o = S.objectifs || {};
  const c = o.course || {};
  const t = today();
  const { start, end, races } = seasonRange();
  const span = Math.max(U.daysBetween(start, end), 1);
  const pos = (iso) => Math.min(100, Math.max(0, (U.daysBetween(start, iso) / span) * 100));
  const jx = c.date ? U.daysBetween(t, c.date) : null;

  // Héros + semaine en cours
  const history = races.map((r) => `<span class="muted">${esc(raceName(r))} ${U.fmtShort(r.date)}</span><strong>${esc(raceTime(r))}</strong>`)
    .join(`<span class="muted" aria-hidden="true">→</span>`);
  const upcoming = S.plan.sessions.filter((s) => s.date >= t).slice(0, 4);
  const hero = `
  <section class="row">
    <div class="card grow2" style="flex-direction:row;flex-wrap:wrap;justify-content:space-between;gap:28px;padding:28px">
      <div style="display:flex;flex-direction:column;gap:10px;min-width:0">
        <span class="lbl">Objectif de saison</span>
        <h1>${esc(c.nom || "Objectif à définir")}</h1>
        <div class="sub">${c.date ? esc(U.fmtDay(c.date, true)) + " " + c.date.slice(0, 4) : ""}${c.partenaire ? " · avec " + esc(c.partenaire) : ""}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">${(o.cibles || []).slice(0, 2)
          .map((x, i) => `<span class="pill ${i ? "acc" : ""}">${esc(x.label.replace(/^Cible\s*/i, ""))} ${esc(x.valeur)}</span>`).join("")}</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:14px;margin-top:8px">${history}</div>
      </div>
      ${jx != null && jx >= 0 ? `<div style="display:flex;flex-direction:column;align-items:flex-end;justify-content:center">
        <span class="kpi big">J-${jx}</span><span class="lbl" style="margin-top:8px">${Math.floor(jx / 7)} semaines</span></div>` : ""}
    </div>
    <div class="card grow1">
      <span class="lbl">Cette semaine</span>
      <h2 style="font-size:26px">${esc(S.plan.semaine || weekPhase(U.mondayOf(t)) || "Semaine en cours")}</h2>
      ${S.plan.message_coach ? `<p style="margin:0;color:var(--soft);font-size:14px">${esc(S.plan.message_coach)}</p>` : ""}
      <div style="display:flex;flex-direction:column;gap:8px">
        ${upcoming.map((s) => `<a class="list-item" href="#/seance/${encodeURIComponent(s.id)}"><span>${esc(U.fmtDay(s.date))} · ${esc(shortTitle(s.title))}</span>
          <span style="color:${TYPE_COLOR[s.type]};font-weight:600">${esc(TYPE_LABEL[s.type] || s.type)}</span></a>`).join("") || `<p class="empty">Rien de prévu.</p>`}
      </div>
      <a href="${weekHref(t)}" style="color:var(--accent);font-weight:600;min-height:44px;display:inline-flex;align-items:center">Ouvrir la semaine →</a>
    </div>
  </section>`;

  // Objectifs sur les 3 volets
  const line = (label, note, actuel, cible, color = "var(--accent)") => `<div class="line">
    <div><span style="font-weight:600">${esc(label)}</span><span class="small muted">${esc(note)}</span></div>
    <div class="r"><span style="font-weight:700">${esc(actuel)}</span><span class="small" style="color:${color}">${esc(cible)}</span></div></div>`;
  const sport = (o.objectifs_perso || []).map((x) => line(x.label, "", x.actuel, "→ " + x.cible)).join("");

  const days = [...S.nut.journal.keys()].filter((d) => d <= t).sort().slice(-7);
  const foods = days.map(foodOf).filter(Boolean);
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const pAvg = avg(foods.map((f) => f.m.p));
  const kAvg = avg(foods.map((f) => f.m.kcal));
  const nObj = S.nut.objectifs;
  const pTarget = nObj?.jours?.entrainement?.p;
  const body = S.nut.corps.at(-1);
  const nutri = [
    pAvg != null ? line("Protéines", `Moyenne ${foods.length} j`, `${fr(pAvg)} g/j`, pTarget ? `cible ${pTarget} g${pAvg >= pTarget ? " ✓" : ""}` : "",
      pTarget && pAvg >= pTarget ? "var(--ok)" : "var(--warn)") : "",
    kAvg != null ? line("Énergie", `Moyenne ${foods.length} j`, `${fr(kAvg)} kcal/j`,
      nObj?.jours ? `cible ${fr(nObj.jours.entrainement?.kcal || 0)} / ${fr(nObj.jours.repos?.kcal || 0)} repos` : "", "var(--muted)") : "",
    body ? line("Poids", `${body.balance || "balance"} ${U.fmtShort(body.date)}`, `${fr(body.poids_kg, 1)} kg`,
      body.gras_pct != null ? `${fr(body.gras_pct, 1)} % de gras` : "", "var(--muted)") : "",
  ].join("") || `<p class="empty">Pas encore de journal repas.</p>`;

  const nights = [...S.nut.sommeil.values()].filter((n) => n.date <= t).sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  const sAvg = avg(nights.map((n) => n.score).filter((x) => x != null));
  const dAvg = avg(nights.map((n) => n.duree_min).filter((x) => x != null));
  const worst = nights.filter((n) => n.duree_min != null).sort((a, b) => a.duree_min - b.duree_min)[0];
  const sCible = nObj?.sommeil;
  const sleep = nights.length ? [
    line("Score moyen", `${nights.length} dernières nuits`, sAvg != null ? `${fr(sAvg)} / 100` : "—", sCible?.score ? `cible ${sCible.score}` : "cible à fixer", "var(--muted)"),
    line("Durée moyenne", `${nights.length} dernières nuits`, dAvg != null ? fmtMin(dAvg) : "—", sCible?.duree_min ? `cible ${fmtMin(sCible.duree_min)}` : "cible à fixer", "var(--muted)"),
    worst ? line("Nuit la plus courte", `${U.fmtShort(worst.date)}${worst.coucher ? ", coucher " + worst.coucher : ""}`, fmtMin(worst.duree_min),
      worst.score != null ? `score ${worst.score}` : "", sleepColor(worst.score)) : "",
  ].join("") : `<p class="empty">Pas encore de nuits enregistrées.</p>`;

  const volets = `<section style="display:flex;flex-direction:column;gap:12px">
    <h2 class="muted">Objectifs — 3 volets</h2>
    <div class="grid-auto" style="--min:300px">
      <div class="card"><div class="card-h"><span class="cond" style="font-size:22px;font-weight:700">Sport</span><a class="small muted" href="#/analyses">Détail →</a></div>${sport || `<p class="empty">Aucun objectif chiffré.</p>`}</div>
      <div class="card"><div class="card-h"><span class="cond" style="font-size:22px;font-weight:700">Nutrition</span><span class="small muted">${esc((nObj?.statut || "").split("—")[0])}</span></div>${nutri}</div>
      <div class="card"><div class="card-h"><span class="cond" style="font-size:22px;font-weight:700">Sommeil</span><span class="small muted">Apple Watch</span></div>${sleep}</div>
    </div></section>`;

  // Frise : phases (objectifs.json) + semaines particulières (phase des logs) + courses.
  const phaseColor = (p) => (/taper/i.test(p.nom) ? ["rgba(245,228,0,0.14)", "var(--accent)"]
    : /pic/i.test(p.nom) ? ["rgba(245,228,0,0.38)", "var(--text)"] : null);
  const segs = phases().filter((p) => p.fin >= start && p.debut <= end).map((p, i) => {
    const [bg, fg] = phaseColor(p) || [i % 2 ? "#2a2f38" : "#343a46", "var(--text)"];
    const l = pos(p.debut), w = Math.max(pos(U.addDays(p.fin, 1)) - l - 0.2, 0.5);
    const future = p.debut > t;
    return `<div class="seg" title="${esc(p.nom)} — ${esc(p.focus || "")}" style="left:${l}%;width:${w}%;background:${bg};color:${fg};${future ? "opacity:.75;border:1px dashed #4a505c" : ""}">${esc(p.nom)}</div>`;
  }).join("");
  const special = [];
  for (let m = U.mondayOf(start); m <= end; m = U.addDays(m, 7)) {
    const ph = weekPhase(m);
    const kind = /d[ée]charge/i.test(ph) ? "var(--accent2)" : /taper/i.test(ph) ? "var(--accent)" : /portugal|br[ée]sil|off|vacances/i.test(ph) ? "#4a505c" : null;
    if (kind) special.push(`<div class="wk" title="${esc(ph)}" style="left:${pos(m)}%;width:${(7 / span) * 100 - 0.2}%;background:${kind}"></div>`);
  }
  const marks = [...races.map((r) => [r.date, raceName(r), raceTime(r), "var(--text)"]),
    ...(c.date ? [[c.date, (c.nom || "").split("—")[0].replace(/hyrox/i, "").trim() || "Objectif", "objectif", "var(--accent)"]] : [])]
    .map(([d, n, tt, col]) => {
      const p = pos(d);
      const edge = p < 4 ? "transform:none;align-items:flex-start" : p > 96 ? "transform:translateX(-100%);align-items:flex-end" : "";
      return `<div class="race" style="left:${p}%;color:${col};${edge}"><b>${esc(n)}</b><i>${esc(tt)}</i><s></s></div>`;
    }).join("");
  let months = "";
  for (let m = U.isoDate(new Date(+start.slice(0, 4), +start.slice(5, 7), 1)); m <= end; m = U.isoDate(new Date(+m.slice(0, 4), +m.slice(5, 7), 1))) {
    months += `<a class="month" href="${monthHref(m)}" style="left:${pos(m)}%">${MOIS_COURT[+m.slice(5, 7) - 1]}</a>`;
  }
  const frise = `<section class="card">
    <div class="card-h"><h2>Saison — ${esc(U.fmtShort(start))} → ${esc(U.fmtShort(end))}</h2>
      <div class="legend"><span>${sw("#343a46")}Phase</span><span>${sw("rgba(245,228,0,0.38)")}Pic</span><span>${sw("rgba(245,228,0,0.14)")}Taper</span>
      <span>${sw("var(--accent2)")}Semaine de décharge</span><span>${sw("#4a505c")}Coupure</span></div></div>
    <div class="scroll-x"><div class="frise">
      ${marks}<div class="bar">${segs}</div><div class="weeks">${special.join("")}</div>
      ${t >= start && t <= end ? `<div class="today" style="left:${pos(t)}%"></div><span class="today-l" style="left:${pos(t)}%">Aujourd'hui</span>` : ""}
      ${months}
    </div></div>
    <p class="small muted" style="margin:0">Phases : profil/objectifs.json. Semaines de décharge et coupures : phase notée dans les séances.</p>
  </section>`;

  // Volume hebdo
  const weeks = [];
  for (let m = U.mondayOf(start); m <= U.mondayOf(t); m = U.addDays(m, 7)) weeks.push([m, weekStats(m)]);
  // Semaines à venir jusqu'à la course : plan du coach, sinon projection (hachuré).
  const future = [];
  for (let m = U.addDays(U.mondayOf(t), 7); m <= U.mondayOf(end); m = U.addDays(m, 7)) future.push([m, plannedStats(m)]);
  const hatch = (c) => `repeating-linear-gradient(135deg, ${c} 0 3px, transparent 3px 6px);box-shadow:inset 0 0 0 1px ${c}`;
  const maxMin = Math.max(480, ...weeks.map(([, w]) => w.total), ...future.map(([, w]) => w.total));
  const scaleH = Math.ceil(maxMin / 120) * 120;
  const axis = Array.from({ length: 4 }, (_, i) => `${fr((scaleH / 60) * (1 - i / 4), 1)} h`);
  const peak = weeks.reduce((a, b) => (b[1].total > a[1].total ? b : a), weeks[0] || ["", { total: 0 }]);
  const vol = `<div class="card grow2">
    <div class="card-h"><h2>Volume hebdomadaire</h2>${legend()}</div>
    <div class="scroll-x"><div class="vbars" style="min-width:${Math.max(760, (weeks.length + future.length) * 22)}px">
      <div class="axis">${axis.map((a) => `<span>${a}</span>`).join("")}<span>0</span></div>
      <div class="plot"><div class="cols">${weeks.map(([m, w]) => `<a class="col" href="#/semaine/${m}" title="Semaine du ${U.fmtShort(m)} — ${fmtMin(w.total)}">
        ${GROUPS.filter((g) => w.byGroup[g[0]] > 0).map((g) => `<div style="height:${(w.byGroup[g[0]] / scaleH) * 200}px;background:${g[2]}"></div>`).join("")}</a>`).join("")}${future.map(([m, w]) => `<a class="col fut" href="#/semaine/${m}" title="Semaine du ${U.fmtShort(m)} — ${w.proj ? "projection" : "prévu"} ${fmtMin(w.total)}">
        ${GROUPS.filter((g) => w.byGroup[g[0]] > 0).map((g) => `<div style="height:${(w.byGroup[g[0]] / scaleH) * 200}px;background:${hatch(g[2])}"></div>`).join("")}</a>`).join("")}</div>
      <div class="labels">${weeks.map(([m]) => `<span class="${m === U.mondayOf(t) ? "on" : ""}">${U.fmtShort(m)}</span>`).join("")}${future.map(([m]) => `<span class="fut">${U.fmtShort(m)}</span>`).join("")}</div></div>
    </div></div>
    <p class="small muted" style="margin:0">Minutes réalisées par semaine (séances sautées exclues)${future.length ? ", puis prévu ou projeté en hachuré jusqu'à la course" : ""}. Cliquer une barre ouvre la semaine.${peak?.[1]?.total ? ` Pic : ${fmtMin(peak[1].total)} la semaine du ${U.fmtShort(peak[0])}.` : ""}</p>
  </div>`;

  // Polarisation (estimation RPE, course + Hyrox)
  let easy = 0, hard = 0;
  for (const l of S.logs) {
    if (l.date < start || !["course", "hyrox"].includes(l.type) || l.status === "saute" || l.rpe == null) continue;
    if (l.rpe <= 5) easy += minutes(l); else hard += minutes(l);
  }
  const pct = easy + hard ? Math.round((easy / (easy + hard)) * 100) : null;
  const polar = `<div class="card grow1">
    <h2>Polarisation 80/20</h2>
    ${pct == null ? `<p class="empty">Pas encore de RPE sur les séances course / Hyrox.</p>` : `
    <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><span class="kpi" style="font-size:56px;color:${pct >= 75 ? "var(--ok)" : "var(--warn)"}">${pct} %</span>
      <span class="muted">du temps course + Hyrox à RPE ≤ 5</span></div>
    <span class="lbl">Réalisé</span>${splitBar([{ v: easy, c: "var(--accent2)", label: "Facile" }, { v: hard, c: "var(--danger)", label: "Dur" }])}
    <span class="lbl">Cible</span>${splitBar([{ v: 80, c: "var(--accent2)", label: "Facile" }, { v: 20, c: "var(--danger)", label: "Dur" }])}
    <div class="legend"><span>${sw("var(--accent2)")}Facile (RPE ≤ 5)</span><span>${sw("var(--danger)")}Dur (RPE ≥ 6)</span></div>
    <p class="small muted" style="margin:0">Estimation à partir du RPE déclaré sur ${fmtMin(easy + hard)} (depuis le ${U.fmtShort(start)}). Les logs n'ont pas de zones FC par séance ; le foot n'est pas compté.</p>`}
  </div>`;

  // Cartes mois
  const cards = [];
  for (let m = start.slice(0, 7) + "-01"; m <= end; m = U.isoDate(new Date(+m.slice(0, 4), +m.slice(5, 7), 1))) {
    const key = m.slice(0, 7);
    const logs = S.logs.filter((l) => monthOf(l.date) === key);
    const mins = logs.reduce((a, l) => a + (groupOf(l.type) ? minutes(l) : 0), 0);
    const n = logs.filter((l) => l.type !== "repos" && l.status !== "saute").length;
    const race = logs.find((l) => l.type === "course_officielle");
    const ph = phases().find((p) => monthOf(p.debut) === key) || phaseAt(m);
    const future = key > monthOf(t);
    const current = key === monthOf(t);
    const desc = race ? `${raceName(race)} — ${raceTime(race)}` : ph ? ph.nom : "";
    cards.push(`<a class="card tight" href="#/mois/${key}" style="${future ? "border-style:dashed" : ""};min-height:128px">
      <div class="card-h"><span class="cond" style="font-size:22px;font-weight:700">${esc(U.fmtMonth(m).split(" ")[0])}</span>
        <span class="xs" style="font-weight:700;color:${current ? "var(--ok)" : "var(--muted)"}">${current ? "En cours" : future ? "Prévu" : ""}</span></div>
      <span style="font-weight:600;font-size:14px">${future ? esc(ph?.nom || "") : `${fr(mins / 60, 1)} h · ${n} séance${n > 1 ? "s" : ""}`}</span>
      <span class="small muted">${esc(future ? ph?.focus || "" : desc)}</span></a>`);
  }
  const monthsSec = `<section style="display:flex;flex-direction:column;gap:12px"><h2 class="muted">Mois — cliquer pour descendre</h2>
    <div class="grid-auto" style="--min:190px">${cards.join("")}</div></section>`;

  return hero + volets + frise + `<section class="row">${vol}${polar}</section>` + monthsSec;
}

// ---------------------------------------------------------------- vue Mois

function viewMois(key) {
  const t = today();
  key = /^\d{4}-\d{2}$/.test(key || "") ? key : monthOf(t);
  S.pos.month = key;
  const first = key + "-01";
  const [y, mo] = key.split("-").map(Number);
  const last = U.isoDate(new Date(y, mo, 0));
  const prev = U.isoDate(new Date(y, mo - 2, 1)).slice(0, 7);
  const next = U.isoDate(new Date(y, mo, 1)).slice(0, 7);

  let grid = `<span></span>${JOURS.map((j) => `<span class="lbl head">${j}</span>`).join("")}`;
  for (let m = U.mondayOf(first); m <= last; m = U.addDays(m, 7)) {
    const ws = weekStats(m);
    const ps = plannedStats(m);
    const plannedMin = ps.total;
    const ph = weekPhase(m);
    const code = (ph.match(/^S\d+/) || [""])[0] || `Sem. ${U.fmtShort(m)}`;
    const subTxt = ph.replace(/^S\d+\s*[—-]\s*/, "");
    grid += `<a class="wk" href="#/semaine/${m}"><span class="code">${esc(code)}</span><span class="xs muted">${esc(subTxt)}</span>
      <span style="margin-top:auto;font-size:13px;font-weight:600">${ws.total ? fmtMin(ws.total) : plannedMin ? (ps.proj ? "projection " : "prévu ") + fmtMin(plannedMin) : "—"}</span><span class="go">Voir →</span></a>`;
    for (let i = 0; i < 7; i++) {
      const d = U.addDays(m, i);
      const ses = sessionsOn(d);
      const pain = ses.some((x) => x.log && painLevel(x.s) === "bad");
      const sl = sleepOf(d);
      const fd = foodOf(d);
      const cls = ["day", monthOf(d) !== key ? "out" : "", d === t ? "today" : ""].join(" ");
      grid += `<div class="${cls}">
        <div class="num"><span>${+d.slice(8)}</span>${pain ? `<span class="flag" title="${esc(ses.filter((x) => x.log && painLevel(x.s) === "bad").map((x) => x.s.pain).join(" / "))}">Douleur</span>` : ""}</div>
        ${ses.map(chip).join("") || `<span class="xs" style="color:#6b7280">${d > t ? "—" : ""}</span>`}
        <div class="foot">
          ${S.show.sleep && sl ? `<div><span class="muted">Nuit${sl.duree_min ? " " + fmtMin(sl.duree_min) : ""}</span><strong style="color:${sleepColor(sl.score)}">${sl.score ?? "—"}</strong></div>` : ""}
          ${S.show.food && fd ? `<div><span class="muted">${fr(fd.m.kcal)} kcal</span><strong style="color:${foodColor(fd.ratio)}">${fd.ratio != null ? Math.round(fd.ratio * 100) + " %" : ""}</strong></div>` : ""}
        </div></div>`;
    }
  }

  // Colonne de droite : chiffres du mois et faits marquants
  const logs = S.logs.filter((l) => monthOf(l.date) === key);
  const byGroup = Object.fromEntries(GROUPS.map((g) => [g[0], 0]));
  for (const l of logs) { const g = groupOf(l.type); if (g) byGroup[g] += minutes(l); }
  const total = Object.values(byGroup).reduce((a, b) => a + b, 0);
  const done = logs.filter((l) => l.type !== "repos" && l.status !== "saute").length;
  const skipped = logs.filter((l) => l.status === "saute").length;
  const nights = [...S.nut.sommeil.values()].filter((n) => monthOf(n.date) === key);
  const sAvg = nights.length ? nights.reduce((a, n) => a + (n.score || 0), 0) / nights.length : null;
  const foods = [...S.nut.journal.keys()].filter((d) => monthOf(d) === key).map(foodOf).filter(Boolean);
  const pAvg = foods.length ? foods.reduce((a, f) => a + f.m.p, 0) / foods.length : null;
  const events = [];
  for (const l of logs) {
    if (l.type === "course_officielle") events.push([l.date, "var(--accent)", `${raceName(l)} ${raceTime(l)}`]);
    else if (l.type === "test") events.push([l.date, "var(--violet)", shortTitle(l.title)]);
    if (painLevel(l) === "bad") events.push([l.date, "var(--warn)", l.pain.length > 110 ? l.pain.slice(0, 107).trimEnd() + "…" : l.pain]);
  }
  for (const n of nights) if (n.score != null && n.score < 70) events.push([n.date, "var(--danger)", `Nuit de ${fmtMin(n.duree_min || 0)} (score ${n.score})`]);
  for (const s of S.plan.sessions) if (monthOf(s.date) === key && s.date >= t && ["test", "course_officielle"].includes(s.type)) events.push([s.date, "var(--violet)", `Prévu : ${shortTitle(s.title)}`]);
  events.sort((a, b) => a[0].localeCompare(b[0]));

  const kpi = (v, l) => `<div style="display:flex;flex-direction:column"><span class="kpi">${v}</span><span class="xs muted">${l}</span></div>`;
  const toggle = (k, label) => `<button type="button" class="toggle" data-toggle="${k}" aria-pressed="${S.show[k]}">${label}</button>`;

  return `
  <div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:flex-end">
    <div style="display:flex;flex-direction:column;gap:6px">
      ${crumb([["Saison", "#/saison"], [U.fmtMonth(first), ""]])}
      <div class="titlebar"><a class="arrow" href="#/mois/${prev}" aria-label="Mois précédent">‹</a><h1>${esc(U.fmtMonth(first))}</h1><a class="arrow" href="#/mois/${next}" aria-label="Mois suivant">›</a></div>
    </div>
    <div class="toggles" role="group" aria-label="Volets affichés"><button type="button" class="toggle" aria-pressed="true" disabled>Séances</button>${toggle("sleep", "Sommeil")}${toggle("food", "Nutrition")}</div>
  </div>
  <div class="row">
    <div class="wide scroll-x"><div class="cal">${grid}</div></div>
    <aside class="grow1" style="display:flex;flex-direction:column;gap:16px;flex-basis:300px">
      <div class="card">
        <span class="lbl">${esc(U.fmtMonth(first))}${key === monthOf(t) ? ` au ${U.fmtShort(t)}` : ""}</span>
        <div class="grid-auto" style="--min:110px;gap:14px">
          ${kpi(`${fr(total / 60, 1)} h`, "volume réalisé")}${kpi(done, `séances${skipped ? ` · ${skipped} sautée${skipped > 1 ? "s" : ""}` : ""}`)}
          ${kpi(sAvg != null ? fr(sAvg) : "—", "score sommeil moyen")}${kpi(pAvg != null ? `${fr(pAvg)} g` : "—", "protéines / jour")}
        </div>
        <span class="lbl">Répartition du volume</span>${groupSplit(byGroup)}
      </div>
      <div class="card"><span class="lbl">Faits marquants</span>
        ${events.map(([d, col, txt]) => `<div style="display:flex;gap:10px"><span class="cond" style="flex:none;width:46px;font-weight:700;color:${col}">${U.fmtShort(d)}</span><span style="font-size:14px">${esc(txt)}</span></div>`).join("") || `<p class="empty">Rien de particulier.</p>`}
      </div>
      <div class="legend">${["hyrox", "course", "muscu", "foot", "autre"].map((k) => `<span>${sw(TYPE_COLOR[k])}${TYPE_LABEL[k]}</span>`).join("")}
        <span><span class="sw" style="width:14px;border:1px dashed #9097a3;background:none"></span>Prévu</span>
        <span><span class="sw" style="width:14px;border:1px dotted #5b6170;background:none"></span>Projection (non validée)</span></div>
    </aside>
  </div>`;
}

// ---------------------------------------------------------------- vue Semaine

const parseTarget = (txt) => {
  const n = String(txt ?? "").match(/\d+(?:[.,]\d+)?/g);
  return n ? n.map((x) => Number(x.replace(",", "."))).reduce((a, b) => a + b, 0) / n.length : null;
};

function viewSemaine(monday) {
  const t = today();
  monday = /^\d{4}-\d{2}-\d{2}$/.test(monday || "") ? U.mondayOf(monday) : U.mondayOf(t);
  S.pos.week = monday;
  const sunday = U.addDays(monday, 6);
  const days = Array.from({ length: 7 }, (_, i) => U.addDays(monday, i));
  const ph = weekPhase(monday);
  const salles = S.profil?.salles || {};
  const JOURS_KEYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  const perDay = days.map((d) => sessionsOn(d).map((x) => ({ ...x, plan: x.log ? planById(x.s.plan_id) : x.s })));

  const ws = weekStats(monday);
  const pw = projWeek(monday);
  const planned = pw ? pw.seances || [] : S.plan.sessions.filter((s) => s.date >= monday && s.date <= sunday);
  const plannedMin = planned.reduce((a, s) => a + (Number(s.duration_min) || 0), 0);
  const logs = ws.logs.filter((l) => l.type !== "repos");
  const nDone = logs.filter((l) => l.status !== "saute").length;
  const nMod = logs.filter((l) => l.status === "modifie").length;
  const nSkip = logs.filter((l) => l.status === "saute").length;
  const rpes = ws.logs.map((l) => l.rpe).filter((x) => x != null);
  const nights = days.map(sleepOf).filter(Boolean);
  const foods = days.map(foodOf).filter(Boolean);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const sAvg = avg(nights.map((n) => n.score).filter((x) => x != null));
  const dAvg = avg(nights.map((n) => n.duree_min).filter((x) => x != null));
  const kAvg = avg(foods.map((f) => f.m.kcal));
  const pAvg = avg(foods.map((f) => f.m.p));
  const kcard = (l, v, s) => `<div class="card tight"><span class="lbl">${l}</span><span class="kpi">${v}</span><span class="small muted">${s}</span></div>`;

  // Matrice
  const head = days.map((d, i) => `<div style="padding:4px 8px 8px;display:flex;flex-direction:column">
    <span class="cond" style="font-size:20px;font-weight:700;color:${d === t ? "var(--accent)" : "inherit"}">${JOURS[i]} ${+d.slice(8)}</span>
    <span class="xs muted" title="${esc(salles[JOURS_KEYS[i]] || "")}">${esc((salles[JOURS_KEYS[i]] || "").split("—")[0].split("/")[0].trim())}</span></div>`).join("");
  const cards = perDay.map((list) => `<div style="display:flex;flex-direction:column;gap:6px">${list.map((x) => {
    const s = x.s;
    if (x.proj) {
      return `<div class="scard proj" title="${esc(s.note || "")}">
        <span class="ty" style="color:${TYPE_COLOR[s.type]}">${sw(TYPE_COLOR[s.type])}${esc(TYPE_LABEL[s.type] || s.type)}</span>
        <span class="ti">${esc(s.title)}</span>${s.note ? `<span class="xs muted">${esc(s.note)}</span>` : ""}
        <span class="ft"><span class="muted">${s.duration_min != null ? s.duration_min + " min" : "—"}</span><strong class="muted">Projection</strong></span></div>`;
    }
    const st = x.log ? STATUS_LABEL[s.status] || "" : "Prévue";
    const stc = x.log ? STATUS_COLOR[s.status] || "var(--muted)" : "var(--muted)";
    const dur = s.duration_min == null ? "—" : `${s.duration_min}${x.log && x.plan?.duration_min ? " / " + x.plan.duration_min : ""} min`;
    return `<a class="scard ${x.log ? "" : "plan"}" href="#/seance/${encodeURIComponent(s.id)}">
      <span class="ty" style="color:${TYPE_COLOR[s.type]}">${sw(TYPE_COLOR[s.type])}${esc(TYPE_LABEL[s.type] || s.type)}</span>
      <span class="ti">${esc(s.title.replace(/^🏁\s*/, ""))}</span>
      <span class="ft"><span class="muted">${esc(dur)}</span><strong style="color:${stc}">${esc(st)}</strong></span></a>`;
  }).join("") || `<div class="cell muted">—</div>`}</div>`).join("");
  const rpeRow = perDay.map((list) => `<div class="cell">${list.map((x) => {
    const r = x.log ? x.s.rpe : null;
    const tg = x.plan?.rpe_target;
    const tv = parseTarget(tg);
    const col = r == null || tv == null ? "var(--text)" : r < tv - 0.75 ? "var(--accent2)" : r > tv + 0.75 ? "var(--danger)" : "var(--ok)";
    return `<span><strong style="color:${col}">${r != null ? fr(r, 1) : "—"}</strong><span class="muted"> / ${esc(tg || "—")}</span></span>`;
  }).join("") || "—"}</div>`).join("");
  const fcRow = perDay.map((list) => `<div class="cell">${list.map((x) => `<span>${x.log && x.s.hr_avg ? `${x.s.hr_avg} / ${x.s.hr_max ?? "—"}` : "—"}</span>`).join("") || "—"}</div>`).join("");
  const painRow = perDay.map((list) => {
    const p = list.filter((x) => x.log && x.s.pain);
    if (!p.length) return `<div class="cell muted">—</div>`;
    const bad = p.some((x) => painLevel(x.s) === "bad");
    return `<div class="cell ${bad ? "pain-bad" : "pain-ok"}">${p.map((x) => esc(x.s.pain)).join("<br>")}</div>`;
  }).join("");
  const noteRow = perDay.map((list) => {
    const n = list.filter((x) => x.log && (x.s.coach_note || x.s.comment));
    return `<div class="cell note">${n.map((x) => `<p title="${esc(x.s.coach_note || x.s.comment)}">${x.s.coach_note ? "" : "<em>Corentin :</em> "}${esc(x.s.coach_note || x.s.comment)}</p>`).join("") || "<span class='muted'>—</span>"}</div>`;
  }).join("");
  const sleepRow = days.map((d) => {
    const n = sleepOf(d);
    if (!n) return `<div class="cell muted">—</div>`;
    return `<div class="cell"><div style="display:flex;justify-content:space-between;align-items:baseline">
      <span class="cond" style="font-size:26px;font-weight:700;color:${sleepColor(n.score)}">${n.score ?? "—"}</span><strong class="small">${n.duree_min ? fmtMin(n.duree_min) : ""}</strong></div>
      <div class="meter"><div style="width:${Math.min(100, n.score || 0)}%;background:${sleepColor(n.score)}"></div></div>
      <span class="xs muted">${n.coucher ? "coucher " + esc(n.coucher) : ""}</span></div>`;
  }).join("");
  const foodRow = days.map((d) => {
    const f = foodOf(d);
    if (!f) return `<div class="cell muted">—</div>`;
    const max = Math.max(4200, f.m.kcal);
    return `<div class="cell"><div style="display:flex;justify-content:space-between;align-items:baseline"><strong>${fr(f.m.kcal)} kcal</strong>
      <span class="xs" style="font-weight:700;color:${foodColor(f.ratio)}">${f.ratio != null ? Math.round(f.ratio * 100) + " %" : ""}</span></div>
      <div class="meter"><div style="width:${(f.m.kcal / max) * 100}%;background:${foodColor(f.ratio)}"></div>${f.t ? `<i style="left:${(f.t.kcal / max) * 100}%"></i>` : ""}</div>
      <span class="xs muted">${f.t ? `cible ${fr(f.t.kcal)} · ` : ""}P ${fr(f.m.p)} g</span></div>`;
  }).join("");

  // Lecture croisée : constats calculés, pas d'interprétation.
  const notes = [];
  days.forEach((d) => {
    const n = sleepOf(d);
    if (n?.score != null && n.score < 70) {
      const next = sessionsOn(d).filter((x) => x.s.type !== "repos").map((x) => shortTitle(x.s.title));
      notes.push(["var(--danger)", `Nuit du ${U.fmtShort(U.addDays(d, -1))} au ${U.fmtShort(d)} : ${fmtMin(n.duree_min || 0)}, score ${n.score}${n.coucher ? `, coucher ${n.coucher}` : ""}${next.length ? `, avant : ${next.join(", ")}` : ""}.`]);
    }
    const f = foodOf(d);
    if (f?.ratio != null && (f.ratio > 1.25 || f.ratio < 0.8)) {
      const sport = sessionsOn(d).filter((x) => x.s.type !== "repos").map((x) => shortTitle(x.s.title)).join(", ");
      notes.push(["var(--warn)", `${U.fmtDay(d, true)} : ${fr(f.m.kcal)} kcal, ${f.ratio > 1 ? "+" : ""}${Math.round((f.ratio - 1) * 100)} % vs cible${sport ? ` (jour : ${sport})` : " (jour sans séance)"}.`]);
    }
  });
  perDay.flat().forEach((x) => {
    if (x.log && painLevel(x.s) === "bad") notes.push(["var(--warn)", `Douleur ${U.fmtDay(x.s.date)} : ${x.s.pain}`]);
    const tv = parseTarget(x.plan?.rpe_target);
    if (x.log && x.s.rpe != null && tv != null && Math.abs(x.s.rpe - tv) >= 2) notes.push(["var(--accent2)", `${shortTitle(x.s.title)} : RPE ${fr(x.s.rpe, 1)} pour une cible ${x.plan.rpe_target}.`]);
    if (x.log && x.s.status === "saute") notes.push(["var(--muted)", `Sautée : ${shortTitle(x.s.title)} (${U.fmtDay(x.s.date)}).`]);
  });

  return `
  <div style="display:flex;flex-direction:column;gap:6px">
    ${crumb([["Saison", "#/saison"], [U.fmtMonth(monday).split(" ")[0], monthHref(monday)], [ph.match(/^S\d+/)?.[0] || "Semaine", ""]])}
    <div class="titlebar"><a class="arrow" href="#/semaine/${U.addDays(monday, -7)}" aria-label="Semaine précédente">‹</a>
      <h1>${esc(ph || "Semaine du " + U.fmtShort(monday))}</h1>
      <a class="arrow" href="#/semaine/${U.addDays(monday, 7)}" aria-label="Semaine suivante">›</a></div>
    <div class="sub">${esc(U.fmtDay(monday, true))} → ${esc(U.fmtDay(sunday, true))}${U.mondayOf(t) === monday && S.plan.message_coach ? " · " + esc(S.plan.message_coach) : ""}</div>
    ${pw ? `<div class="proj-banner"><strong>Projection — pas encore validée par le coach.</strong> Semaine type sans contraintes${pw.focus ? " · " + esc(pw.focus) : ""}. Elle sera remplacée par le vrai programme dès qu'il sera écrit.${S.proj.avertissement ? `<br><span class="xs">${esc(S.proj.avertissement)}</span>` : ""}</div>` : ""}
  </div>
  <section class="grid-auto" style="--min:200px;gap:14px">
    ${kcard("Volume", fmtMin(ws.total), plannedMin ? `${pw ? "projection" : "prévu"} ${fmtMin(plannedMin)}${ws.total ? ` · ${Math.round((ws.total / plannedMin) * 100)} %` : ""}` : "réalisé")}
    ${kcard("Séances", `${nDone}`, `${nMod} modifiée${nMod > 1 ? "s" : ""} · ${nSkip} sautée${nSkip > 1 ? "s" : ""}`)}
    ${kcard("RPE moyen", rpes.length ? fr(avg(rpes), 1) : "—", `${rpes.length} séance${rpes.length > 1 ? "s" : ""} notée${rpes.length > 1 ? "s" : ""}`)}
    ${kcard("Sommeil", sAvg != null ? `${fr(sAvg)} · ${fmtMin(dAvg || 0)}` : "—", "score · durée moyenne")}
    ${kcard("Nutrition", kAvg != null ? `${fr(kAvg)} kcal` : "—", pAvg != null ? `${fr(pAvg)} g de protéines / jour` : "pas de journal")}
  </section>
  <section class="scroll-x"><div class="wgrid">
    <span></span>${head}
    <span class="lbl">Séances</span>${cards}
    <span class="lbl">RPE réel / cible</span>${rpeRow}
    <span class="lbl">FC moy / max</span>${fcRow}
    <span class="lbl">Douleurs</span>${painRow}
    <span class="lbl">Notes</span>${noteRow}
    <span class="lbl">Sommeil (nuit d'avant)</span>${sleepRow}
    <span class="lbl">Nutrition</span>${foodRow}
  </div></section>
  <section class="row">
    <div class="card grow2"><h2>Lecture croisée</h2>
      <div class="bullets">${notes.map(([c, txt]) => `<div><i style="background:${c}"></i><span>${esc(txt)}</span></div>`).join("") || `<p class="empty">Rien de notable cette semaine.</p>`}</div></div>
    <div class="card grow1"><h2>Volume par type</h2>${groupSplit(ws.byGroup)}
      <a href="#/analyses" style="color:var(--accent);font-weight:600;min-height:44px;display:inline-flex;align-items:center">Voir les tendances →</a></div>
  </section>`;
}

// ---------------------------------------------------------------- vue Séance

function fmtSetVal(s) {
  if (!s) return "—";
  const parts = [];
  if (s.reps != null) parts.push(s.weight_kg != null ? `${s.reps} × ${fr(s.weight_kg, 1)}` : `${s.reps} reps`);
  else if (s.weight_kg != null) parts.push(`${fr(s.weight_kg, 1)} kg`);
  if (s.distance_m != null) parts.push(`${fr(s.distance_m)} m`);
  if (s.duration_s != null) parts.push(U.fmtDuration(s.duration_s));
  if (s.speed_kmh != null) parts.push(`${fr(s.speed_kmh, 1)} km/h`);
  return parts.join(" · ") || "—";
}

function pace(s, exId) {
  if (!s?.distance_m || !s?.duration_s) return "";
  const cat = S.ex.get(exId)?.category;
  if (cat === "hyrox" && /ski|rameur|row/i.test(exId)) return `${U.fmtDuration((s.duration_s / s.distance_m) * 500)} / 500 m`;
  if (/course|run/i.test(exId)) return `${U.fmtDuration((s.duration_s / s.distance_m) * 1000)} / km`;
  return "";
}

function delta(s) {
  const p = s.plan;
  if (!p) return ["", "var(--muted)"];
  if (s.done === false) return ["non faite", "var(--danger)"];
  const dw = s.weight_kg != null && p.weight_kg != null ? Math.round((s.weight_kg - p.weight_kg) * 10) / 10 : 0;
  const dr = s.reps != null && p.reps != null ? s.reps - p.reps : 0;
  if (!dw && !dr) return ["=", "var(--ok)"];
  const txt = [dw ? `${dw > 0 ? "+" : ""}${fr(dw, 1)} kg` : "", dr ? `${dr > 0 ? "+" : ""}${dr} reps` : ""].filter(Boolean).join(" ");
  return [txt, dw < 0 || dr < 0 ? "var(--warn)" : "var(--ok)"];
}

// Charge max réalisée par séance pour un exercice.
function weightHistory(exId, until) {
  const pts = [];
  for (const l of S.logs) {
    if (l.status === "saute" || (until && l.date > until)) continue;
    let max = null;
    for (const b of l.blocks || []) for (const it of b.items || []) {
      if (it.exercise !== exId) continue;
      for (const s of it.sets || []) if (s.done !== false && s.weight_kg != null) max = Math.max(max ?? 0, s.weight_kg);
    }
    if (max != null) pts.push({ v: max, label: U.fmtShort(l.date), date: l.date });
  }
  return pts;
}

function viewSeance(id) {
  if (!id) id = S.pos.seance || S.logs.filter((l) => l.date <= today()).at(-1)?.id;
  const log = S.logs.find((l) => l.id === id);
  const s = log || planById(id);
  if (!s) return `<p class="empty">Séance introuvable (elle a peut-être été retirée du plan).</p><a href="#/saison" style="color:var(--accent)">← Saison</a>`;
  S.pos.seance = s.id;
  const plan = log ? planById(log.plan_id) : s;
  const ph = weekPhase(U.mondayOf(s.date));
  const sl = sleepOf(s.date);
  const fd = foodOf(s.date);
  const veille = sessionsOn(U.addDays(s.date, -1)).filter((x) => x.s.type !== "repos");
  const sets = (s.blocks || []).flatMap((b) => (b.items || []).flatMap((it) => it.sets || []));
  const withPlan = (s.blocks || []).flatMap((b) => b.items || []).filter((it) => (it.sets || []).some((x) => x.plan?.weight_kg != null));
  const atPlan = withPlan.filter((it) => it.sets.every((x) => delta(x)[0] === "=")).length;
  const kcard = (l, v, sub, col) => `<div class="card tight"><span class="lbl">${l}</span><span class="kpi" style="${col ? "color:" + col : ""}">${v}</span><span class="small muted">${sub}</span></div>`;
  const tv = parseTarget(plan?.rpe_target);
  const rpeCol = s.rpe == null || tv == null ? "" : s.rpe < tv - 0.75 ? "var(--accent2)" : s.rpe > tv + 0.75 ? "var(--danger)" : "var(--ok)";

  const kpis = log ? [
    kcard("Durée", s.duration_min ? `${s.duration_min} min` : "—", plan?.duration_min ? `prévu ${plan.duration_min}` : ""),
    kcard("RPE", s.rpe != null ? fr(s.rpe, 1) : "—", plan?.rpe_target ? `cible ${esc(plan.rpe_target)}` : "", rpeCol),
    s.feeling != null ? kcard("Ressenti", `${s.feeling} / 10`, "feeling") : "",
    kcard("FC moy / max", s.hr_avg ? `${s.hr_avg} / ${s.hr_max ?? "—"}` : "—", "bpm"),
    withPlan.length ? kcard("Charges", `${atPlan} / ${withPlan.length}`, "exercices au prévu") : "",
    kcard("Nuit d'avant", sl?.duree_min ? fmtMin(sl.duree_min) : "—", sl ? `score ${sl.score ?? "—"}${sl.coucher ? " · coucher " + esc(sl.coucher) : ""}` : "pas de donnée"),
  ].join("") : [
    kcard("Durée prévue", s.duration_min ? `${s.duration_min} min` : "—", s.when ? esc(s.when) : ""),
    kcard("RPE cible", esc(s.rpe_target || "—"), ""),
    kcard("Séries prévues", sets.length, ""),
  ].join("");

  const ctxBlock = [
    plan?.objective ? `<div style="display:flex;flex-direction:column;gap:4px"><span class="lbl">Objectif</span><span style="font-size:14px">${esc(plan.objective)}</span></div>` : "",
    plan?.intensity ? `<div style="display:flex;flex-direction:column;gap:4px"><span class="lbl">Intensité</span><span style="font-size:14px">${esc(plan.intensity)}</span></div>` : "",
    plan?.attention ? `<div style="display:flex;flex-direction:column;gap:4px"><span class="lbl" style="color:var(--warn)">Attention</span><span style="font-size:14px">${esc(plan.attention)}</span></div>` : "",
  ].join("");

  const blocks = (s.blocks || []).map((b) => {
    const warm = /chauffement/i.test(b.name);
    const groups = [];
    for (const it of b.items || []) {
      const g = it.group || "";
      if (!groups.length || groups.at(-1).name !== g) groups.push({ name: g, items: [] });
      groups.at(-1).items.push(it);
    }
    if (warm) {
      return `<section class="card"><h2>${esc(b.name)}</h2><div class="scroll-x"><table>
        <thead><tr><th>Exercice</th><th>${log ? "Réalisé" : "Prévu"}</th><th>Allure</th><th>Consigne</th></tr></thead><tbody>
        ${(b.items || []).map((it) => `<tr><td style="font-weight:600">${esc(it.label || exName(it.exercise))}${it.group ? ` <span class="xs muted">${esc(it.group)}</span>` : ""}</td>
          <td>${esc((it.sets || []).map(fmtSetVal).join(" · ") || "—")}</td>
          <td>${esc(pace((it.sets || [])[0], it.exercise))}</td><td class="muted">${esc([it.target, it.note].filter(Boolean).join(" · "))}</td></tr>`).join("")}
        </tbody></table></div></section>`;
    }
    return `<section class="card"><div class="card-h"><h2>${esc(b.name)}${log ? " — prévu vs réalisé" : ""}</h2></div>
      ${groups.map((g) => `<div style="display:flex;flex-direction:column;gap:8px">${g.name ? `<span class="lbl" style="color:var(--accent)">${esc(g.name)}</span>` : ""}
        <div class="grid-auto" style="--min:300px;gap:14px">${g.items.map((it) => {
          const ex = S.ex.get(it.exercise);
          const ds = (it.sets || []).map(delta);
          const verdict = !log ? "" : ds.every((d) => d[0] === "=") ? ["Au prévu", "var(--ok)"] : ds.some((d) => d[1] === "var(--warn)" || d[1] === "var(--danger)") ? ["En dessous", "var(--warn)"] : ds.some((d) => d[0]) ? ["Au-dessus", "var(--ok)"] : "";
          return `<div class="exo"><div class="card-h"><strong>${esc(it.label || exName(it.exercise))}</strong>${verdict ? `<span class="xs" style="font-weight:700;color:${verdict[1]}">${verdict[0]}</span>` : ""}</div>
            ${[it.target, it.note, ex?.load === "par_haltere" ? "kg par haltère" : ""].filter(Boolean).length ? `<span class="xs muted">${esc([it.target, it.note, ex?.load === "par_haltere" ? "kg par haltère" : ""].filter(Boolean).join(" · "))}</span>` : ""}
            <table><thead><tr><th>Série</th>${log ? "<th>Prévu</th><th>Réalisé</th><th>Écart</th>" : "<th>Prévu</th>"}</tr></thead><tbody>
            ${(it.sets || []).map((x, i) => log
              ? `<tr><td class="muted">${i + 1}</td><td class="muted">${esc(fmtSetVal(x.plan))}</td><td style="font-weight:600">${esc(fmtSetVal(x))}</td><td style="font-weight:700;color:${ds[i][1]}">${esc(ds[i][0])}</td></tr>`
              : `<tr><td class="muted">${i + 1}</td><td>${esc(fmtSetVal(x))}</td></tr>`).join("")}
            </tbody></table></div>`;
        }).join("")}</div></div>`).join("")}
    </section>`;
  }).join("");

  // Courbes de charge des exercices lestés de la séance
  const weighted = [...new Set((s.blocks || []).filter((b) => !/chauffement/i.test(b.name))
    .flatMap((b) => b.items || []).filter((it) => (it.sets || []).some((x) => x.weight_kg != null)).map((it) => it.exercise))];
  const charts = weighted.slice(0, 4).map((exId, i) => {
    const pts = weightHistory(exId, s.date).slice(-14);
    const col = ["#a78bfa", "#4fd1c5", "#ff9f5a", "#f5e400"][i];
    return `<div class="card"><div class="card-h"><span class="lbl">${esc(exName(exId))}</span><strong>${pts.length ? fr(pts.at(-1).v, 1) + " kg" : ""}</strong></div>
      ${lineChart(pts, col)}<div class="xs muted" style="display:flex;justify-content:space-between"><span>${pts[0]?.label || ""}</span><span>charge max par séance</span><span>${pts.at(-1)?.label || ""}</span></div></div>`;
  }).join("");

  // Prochaine séance du plan qui reprend ces exercices
  const nextPlan = S.plan.sessions.find((p) => p.date > s.date && p.id !== s.id && (p.blocks || []).some((b) => (b.items || []).some((it) => weighted.includes(it.exercise))));
  const nextList = nextPlan ? (nextPlan.blocks || []).flatMap((b) => b.items || []).filter((it) => weighted.includes(it.exercise)).map((it) => {
    const p = (it.sets || [])[0];
    const prevMax = weightHistory(it.exercise, s.date).at(-1)?.v;
    const col = p?.weight_kg == null || prevMax == null ? "var(--text)" : p.weight_kg > prevMax ? "var(--ok)" : p.weight_kg < prevMax ? "var(--warn)" : "var(--text)";
    return `<div style="display:flex;justify-content:space-between;gap:10px;font-size:14px"><span>${esc(exName(it.exercise))}</span><strong style="color:${col}">${esc(fmtSetVal(p))}</strong></div>`;
  }).join("") : "";

  const typeCol = TYPE_COLOR[s.type] || "#7d8592";
  return `
  <div style="display:flex;flex-direction:column;gap:8px">
    ${crumb([["Saison", "#/saison"], [U.fmtMonth(s.date).split(" ")[0], monthHref(s.date)], [ph.match(/^S\d+/)?.[0] || "Semaine", weekHref(s.date)], [U.fmtDay(s.date, true), ""]])}
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
      <span class="tag" style="color:${typeCol};background:${typeCol}22">${esc(TYPE_LABEL[s.type] || s.type)}</span>
      <span class="tag" style="color:${log ? STATUS_COLOR[s.status] : "var(--muted)"};background:#ffffff10">${log ? esc(STATUS_LABEL[s.status] || s.status) : "Prévue"}</span>
      ${s.approx ? `<span class="tag muted" style="border:1px dashed var(--line)">Import Excel · approximatif</span>` : ""}
      ${log?.source ? `<span class="small muted">Saisie : ${esc(log.source)}${log.updated_at ? " · " + esc(log.updated_at.slice(0, 16).replace("T", " ")) + " UTC" : ""}</span>` : ""}
    </div>
    <h1>${esc(s.title)}</h1>
    <div class="sub">${esc(U.fmtDay(s.date, true))} ${s.date.slice(0, 4)}${s.location || plan?.location ? " · " + esc(s.location || plan.location) : ""}</div>
  </div>
  <section class="grid-auto" style="--min:160px;gap:12px">${kpis}</section>
  <div class="row">
    <div class="wide" style="display:flex;flex-direction:column;gap:20px">
      ${ctxBlock ? `<section class="card"><div class="grid-auto" style="--min:240px">${ctxBlock}</div></section>` : ""}
      ${blocks || `<section class="card"><p class="empty">Pas de détail d'exercices.</p></section>`}
      ${s.text ? `<section class="card"><span class="lbl">Texte d'origine (import)</span><p style="margin:0;white-space:pre-line;font-size:14px">${esc(s.text)}</p></section>` : ""}
    </div>
    <aside class="grow1" style="display:flex;flex-direction:column;gap:16px;flex-basis:360px">
      ${log?.comment ? `<div class="card"><span class="lbl">Commentaire de Corentin</span><p style="margin:0;font-size:14px">« ${esc(log.comment)} »</p></div>` : ""}
      ${log?.pain ? `<div class="card"><span class="lbl" style="color:${painLevel(log) === "bad" ? "var(--warn)" : "var(--muted)"}">Douleurs / sensations</span><p style="margin:0;font-size:14px">${esc(log.pain)}</p></div>` : ""}
      ${log?.coach_note ? `<div class="card hl"><span class="lbl" style="color:var(--accent)">Note du coach</span><p style="margin:0;font-size:14px">${esc(log.coach_note)}</p></div>` : ""}
      ${nextList ? `<div class="card"><span class="lbl">Prochaine fois · <a href="#/seance/${encodeURIComponent(nextPlan.id)}" style="text-decoration:underline">${esc(U.fmtDay(nextPlan.date))}</a></span>${nextList}</div>` : ""}
      <div class="card"><span class="lbl">Contexte du jour</span>
        <div style="display:flex;justify-content:space-between;font-size:14px"><span class="muted">Énergie</span><span>${fd ? `<strong style="color:${foodColor(fd.ratio)}">${fr(fd.m.kcal)}</strong>${fd.t ? " / " + fr(fd.t.kcal) : ""} kcal` : "—"}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:14px"><span class="muted">Protéines</span><span>${fd ? `<strong style="color:${fd.t?.p && fd.m.p >= fd.t.p ? "var(--ok)" : "var(--warn)"}">${fr(fd.m.p)}</strong>${fd.t?.p ? " / " + fd.t.p : ""} g` : "—"}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:14px"><span class="muted">Sommeil</span><span>${sl ? `${fmtMin(sl.duree_min || 0)} · score ${sl.score ?? "—"}` : "—"}</span></div>
        <div style="display:flex;justify-content:space-between;gap:10px;font-size:14px"><span class="muted">Veille</span><span style="text-align:right">${veille.map((x) => esc(shortTitle(x.s.title)) + (x.s.duration_min ? ` ${x.s.duration_min} min` : "")).join(", ") || "Rien"}</span></div>
      </div>
      ${charts}
    </aside>
  </div>`;
}

// ---------------------------------------------------------------- vue Analyses

// Volume par station Hyrox depuis une course : séances d'entraînement seulement (courses officielles exclues).
// Unité commune = la distance (ou les reps) de la station en course : 1 = une station complète.
// Série avec un temps mais sans distance/reps (imports Excel) → comptée comme une station complète, en estimé.
function stationVolume() {
  const t = today();
  const stations = [...S.ex.values()].filter((e) => e.category === "hyrox" && (e.race?.distance_m || e.race?.reps));
  if (!stations.length) return `<p class="empty">Pas de station avec distance de course dans le catalogue.</p>`;
  const races = S.logs.filter((l) => l.type === "course_officielle");
  if (!S.stFrom) S.stFrom = (races.find((r) => /lyon/i.test(r.title)) || races.at(-1))?.id || "28j";
  const race = races.find((r) => r.id === S.stFrom);
  const from = race ? race.date : U.addDays(t, -28);
  const logs = S.logs.filter((l) => l.date > from && l.date <= t && l.type !== "course_officielle" && l.status !== "saute");

  const acc = new Map(stations.map((e) => [e.id, { mes: 0, est: 0, blind: 0, days: new Set() }]));
  const blindLogs = []; // séances Hyrox sans aucune station détaillée (texte d'import seulement)
  for (const l of logs) {
    for (const b of l.blocks || []) {
      if (!S.show.warm && /chauffement/i.test(b.name)) continue;
      for (const it of b.items || []) {
        const a = acc.get(it.exercise);
        if (!a) continue;
        const key = S.ex.get(it.exercise).race.reps ? "reps" : "distance_m";
        for (const x of it.sets || []) {
          if (x.done === false) continue;
          a.days.add(l.date);
          if (x[key]) a.mes += x[key];
          else if (x.duration_s) a.est += S.ex.get(it.exercise).race[key];
          else a.blind += 1;
        }
      }
    }
    if (l.type === "hyrox" && !(l.blocks || []).some((b) => (b.items || []).some((it) => acc.has(it.exercise)))) blindLogs.push(l);
  }

  const rows = stations.map((e) => {
    const a = acc.get(e.id);
    const std = e.race.reps || e.race.distance_m;
    const last = [...a.days].sort().at(-1) || null;
    return { e, a, std, unit: e.race.reps ? "reps" : "m", mes: a.mes / std, est: a.est / std, last, gap: last ? U.daysBetween(last, t) : null };
  });
  const max = Math.max(...rows.map((r) => r.mes + r.est), 1);
  const avg = rows.reduce((x, r) => x + r.mes + r.est, 0) / rows.length;
  const hatch = "repeating-linear-gradient(135deg, var(--accent) 0 3px, transparent 3px 6px);box-shadow:inset 0 0 0 1px var(--accent)";
  const opts = [...races.map((r) => [r.id, `Depuis ${raceName(r)} (${U.fmtShort(r.date)})`]), ["28j", "28 derniers jours"]];

  return `<div class="card-h"><h2>Volume par station</h2>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <select class="dsel" id="st-from">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === S.stFrom ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
        <button type="button" class="toggle" data-toggle="warm" aria-pressed="${S.show.warm}">Échauffements inclus</button></div></div>
    <p class="small muted" style="margin:0">${logs.length} séances d'entraînement du ${U.fmtShort(U.addDays(from, 1))} au ${U.fmtShort(t)} (courses officielles exclues). Unité : « × course » = nombre de stations complètes (ex. ×3 au ski erg = 3 000 m). Hachuré = estimé : temps saisi sans distance, compté comme une station complète.</p>
    <div class="scroll-x"><table style="min-width:760px"><thead><tr><th>Station</th><th style="width:38%">× course</th><th>Volume</th><th>Séances</th><th>Dernière fois</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td style="font-weight:600">${esc(r.e.name)}</td>
      <td><div style="display:flex;align-items:center;gap:10px"><div style="position:relative;flex:1;height:12px;display:flex;border-radius:3px;background:var(--surface2)">
        <i style="display:block;width:${(r.mes / max) * 100}%;background:var(--accent);border-radius:3px 0 0 3px"></i>
        <i style="display:block;width:${(r.est / max) * 100}%;background:${hatch}"></i>
        <s title="moyenne des stations" style="position:absolute;top:-3px;bottom:-3px;left:${(avg / max) * 100}%;border-left:2px solid var(--text);opacity:.5"></s></div>
        <strong style="width:44px;text-align:right">×${fr(r.mes + r.est, 1)}</strong></div></td>
      <td class="small">${fr(r.a.mes)} ${r.unit}${r.a.est ? ` <span class="muted">+ ~${fr(r.a.est)} estimé</span>` : ""}${r.a.blind ? ` <span class="muted">· ${r.a.blind} série${r.a.blind > 1 ? "s" : ""} sans distance</span>` : ""}</td>
      <td>${r.a.days.size}</td>
      <td style="color:${r.gap == null || r.gap > 14 ? "var(--warn)" : "var(--text)"}">${r.last ? `${U.fmtShort(r.last)} · il y a ${r.gap} j` : "—"}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="small muted" style="margin:0">Trait vertical = moyenne des stations (×${fr(avg, 1)}). En orange : station pas travaillée depuis plus de 14 jours (règle : chaque station au moins toutes les 2 semaines).${blindLogs.length ? ` Non comptées, faute de détail par station : ${blindLogs.map((l) => `<a href="#/seance/${encodeURIComponent(l.id)}" style="text-decoration:underline">${esc(shortTitle(l.title))} (${U.fmtShort(l.date)})</a>`).join(", ")}.` : ""}</p>`;
}

function viewAnalyses() {
  const t = today();
  const ref = S.objectifs?.references;

  // Chronos Hyrox : tableau de référence (profil/objectifs.json).
  let hyrox = `<p class="empty">Pas de tableau de référence dans profil/objectifs.json.</p>`;
  if (ref?.segments?.length) {
    // Premier temps de la cellule ("~48:00", "50:21*", "1:18-1:20").
    const tok = (v) => String(v || "").match(/\d+(?::\d{2})+/)?.[0] || null;
    const cols = ref.colonnes || [];
    const colors = ["#5b6170", "#4fd1c5", "#f5e400", "#a78bfa", "#ff9f5a"];
    hyrox = `<div class="legend">${cols.map((c, i) => `<span>${sw(colors[i % colors.length])}${esc(c)}</span>`).join("")}</div>
      <div class="scroll-x"><table style="min-width:860px"><thead><tr><th>Segment</th>${cols.map((c) => `<th>${esc(c.split("(")[0])}</th>`).join("")}<th style="width:34%">Comparaison</th></tr></thead><tbody>
      ${ref.segments.map((sg) => {
        // Ligne en h:mm:ss (TOTAL) : une cible "1:18" se lit en heures:minutes.
        const toks = sg.valeurs.map(tok);
        const hours = toks.some((x) => x && x.split(":").length === 3);
        const vals = toks.map((x) => (x ? U.parseDuration(hours && x.split(":").length === 2 ? x + ":00" : x) : null));
        const max = Math.max(...vals.filter((v) => v != null), 1);
        const bold = /total|roxzone/i.test(sg.segment);
        return `<tr><td style="font-weight:${bold ? 700 : 500}">${esc(sg.segment)}</td>${sg.valeurs.map((v, i) => `<td style="${i === sg.valeurs.length - 1 ? "color:var(--accent)" : ""}">${esc(v || "—")}</td>`).join("")}
          <td><div style="display:flex;flex-direction:column;gap:3px">${vals.map((v, i) => (v != null ? `<div style="height:6px;border-radius:3px;width:${(v / max) * 100}%;background:${colors[i % colors.length]}"></div>` : "")).join("")}</div></td></tr>`;
      }).join("")}</tbody></table></div>
      ${ref.note ? `<p class="small muted" style="margin:0">${esc(ref.note)}</p>` : ""}`;
  }

  // Charges : sélecteur d'exercice
  const counts = new Map();
  for (const l of S.logs) for (const b of l.blocks || []) for (const it of b.items || [])
    if ((it.sets || []).some((s) => s.weight_kg != null)) counts.set(it.exercise, (counts.get(it.exercise) || 0) + 1);
  const isMuscu = (id) => /^muscu/.test(S.ex.get(id)?.category || "");
  const exs = [...counts].sort((a, b) => isMuscu(b[0]) - isMuscu(a[0]) || b[1] - a[1]).map((x) => x[0]);
  if (!S.analysisEx || !exs.includes(S.analysisEx)) S.analysisEx = exs[0];
  const hist = S.analysisEx ? weightHistory(S.analysisEx) : [];
  const lastRows = exs.slice(0, 8).map((id) => {
    const h = weightHistory(id);
    const last = h.at(-1);
    const nextPlan = S.plan.sessions.find((p) => p.date >= t && (p.blocks || []).some((b) => (b.items || []).some((it) => it.exercise === id)));
    const np = nextPlan && (nextPlan.blocks || []).flatMap((b) => b.items || []).find((it) => it.exercise === id)?.sets?.[0];
    const col = np?.weight_kg == null || !last ? "var(--text)" : np.weight_kg > last.v ? "var(--ok)" : np.weight_kg < last.v ? "var(--warn)" : "var(--text)";
    return `<tr><td style="font-weight:600">${esc(exName(id))}</td><td>${last ? `${fr(last.v, 1)} kg · ${last.label}` : "—"}</td>
      <td style="font-weight:700;color:${col}">${np ? esc(fmtSetVal(np)) : "—"}</td><td class="small muted">${h.length} séances</td></tr>`;
  }).join("");

  // Volume mensuel
  const { start } = seasonRange();
  const months = [];
  for (let m = start.slice(0, 7) + "-01"; m <= t; m = U.isoDate(new Date(+m.slice(0, 4), +m.slice(5, 7), 1))) {
    const key = m.slice(0, 7);
    const logs = S.logs.filter((l) => monthOf(l.date) === key);
    months.push({ key, mins: logs.reduce((a, l) => a + (groupOf(l.type) ? minutes(l) : 0), 0), n: logs.filter((l) => l.type !== "repos" && l.status !== "saute").length });
  }
  const maxM = Math.max(...months.map((m) => m.mins), 60);

  // Douleurs : 90 derniers jours
  const since = U.addDays(t, -90);
  const pains = S.logs.filter((l) => l.pain && l.date >= since);
  const bless = S.profil?.blessures || [];

  return `
  <h1>Analyses</h1>
  <section class="card"><div class="card-h"><h2>Chronos Hyrox par segment</h2></div>${hyrox}</section>
  <section class="card">${stationVolume()}</section>
  <div class="row">
    <section class="card grow1" style="flex-basis:520px">
      <div class="card-h"><h2>Progression des charges</h2>
        <label class="small muted" style="display:flex;align-items:center;gap:8px">Exercice
          <select class="dsel" id="ex-select">${exs.map((id) => `<option value="${esc(id)}" ${id === S.analysisEx ? "selected" : ""}>${esc(exName(id))}</option>`).join("")}</select></label></div>
      ${lineChart(hist.slice(-20), "#a78bfa")}
      <div class="xs muted" style="display:flex;justify-content:space-between"><span>${hist.slice(-20)[0]?.label || ""}</span><span>charge max par séance${S.ex.get(S.analysisEx)?.load === "par_haltere" ? " · kg par haltère" : ""}</span><span>${hist.at(-1)?.label || ""}</span></div>
      <div class="scroll-x"><table><thead><tr><th>Exercice</th><th>Dernière charge</th><th>Prochaine (plan)</th><th></th></tr></thead><tbody>${lastRows}</tbody></table></div>
    </section>
    <section class="card grow1" style="flex-basis:520px">
      <h2>Volume mensuel</h2>
      <div class="simple-bars">${months.map((m) => `<div><b>${fr(m.mins / 60, 1)} h</b><i style="height:${(m.mins / maxM) * 150}px;background:${m.key === monthOf(t) ? "var(--accent)" : "#3a404c"}"></i></div>`).join("")}</div>
      <div class="simple-labels">${months.map((m) => `<span><a href="#/mois/${m.key}"><b>${MOIS_COURT[+m.key.slice(5) - 1]}</b></a>${m.n} séances</span>`).join("")}</div>
    </section>
  </div>
  ${viewRecup()}
  <div class="row">
    <section class="card grow1" style="flex-basis:420px">
      <h2>Douleurs — 90 jours</h2>
      <div style="display:flex;flex-direction:column">${pains.map((l) => `<a href="#/seance/${encodeURIComponent(l.id)}" style="display:flex;gap:14px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--surface2)">
        <span class="cond" style="flex:none;width:48px;font-weight:700">${U.fmtShort(l.date)}</span>
        <i style="flex:none;margin-top:6px;width:10px;height:10px;border-radius:50%;background:${painLevel(l) === "bad" ? "var(--warn)" : "var(--ok)"}"></i>
        <span style="font-size:14px">${esc(l.pain)}</span></a>`).join("") || `<p class="empty">Aucune douleur notée.</p>`}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">${bless.map((b) => `<span class="pill" style="font-size:13px;font-weight:500;${/surveillance/i.test(b.statut) ? "color:var(--warn)" : ""}">${esc(b.zone)} · ${esc(b.statut)}</span>`).join("")}</div>
    </section>
  </div>`;
}

// ---------------------------------------------------------------- Analyses : sommeil, nutrition, corps

const PHASES = [["profond", "Profond", "#7c8cf8"], ["paradoxal", "Paradoxal", "#4fd1c5"], ["lent", "Lent", "#5b6170"], ["eveil", "Éveil", "#ffb547"]];
const GRAINS = [["jour", "Par jour"], ["semaine", "Par semaine"], ["mois", "Par mois"]];
const balanceLabel = (id) => BALANCES.find(([b]) => b === id)?.[1] || id || "balance";

// "00:32", "~00:20", "23:53" → minutes après 18 h (pour moyenner des couchers autour de minuit).
function bedMinutes(txt) {
  const m = String(txt || "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return ((+m[1] * 60 + +m[2] - 18 * 60) + 1440) % 1440;
}
const fmtBed = (v) => (v == null ? "—" : `${U.pad(Math.floor((v / 60 + 18) % 24))}:${U.pad(Math.round(v % 60))}`);

function bucketOf(iso) {
  if (S.grain === "semaine") { const m = U.mondayOf(iso); return [m, `Sem. ${U.fmtShort(m)}`]; }
  if (S.grain === "mois") { const k = monthOf(iso); return [k, U.fmtMonth(k + "-01")]; }
  return [iso, U.fmtDay(iso).split(" ").slice(0, 2).join(" ")];
}
function buckets(items) {
  const map = new Map();
  for (const it of items) {
    const [k, label] = bucketOf(it.date);
    if (!map.has(k)) map.set(k, { k, label, items: [] });
    map.get(k).items.push(it);
  }
  return [...map.values()].sort((a, b) => a.k.localeCompare(b.k));
}
const mean = (a) => { const v = a.filter((x) => x != null && !Number.isNaN(x)); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };

function viewRecup() {
  const t = today();
  const grainBtns = GRAINS.map(([g, l]) => `<button type="button" class="toggle" data-grain="${g}" aria-pressed="${S.grain === g}">${l}</button>`).join("");

  // ---- Sommeil
  const nights = [...S.nut.sommeil.values()].filter((n) => n.date <= t).sort((a, b) => a.date.localeCompare(b.date));
  const sb = buckets(nights).slice(S.grain === "jour" ? -14 : -12).map((b) => {
    const ph = Object.fromEntries(PHASES.map(([k]) => [k, mean(b.items.map((n) => n.phases_min?.[k]))]));
    const duree = mean(b.items.map((n) => n.duree_min));
    const classed = PHASES.reduce((a, [k]) => a + (ph[k] || 0), 0);
    return { ...b, n: b.items.length, score: mean(b.items.map((n) => n.score)), duree, ph,
      autre: duree != null ? Math.max(0, duree - classed) : 0, bed: mean(b.items.map((n) => bedMinutes(n.coucher))) };
  });
  const maxD = Math.max(540, ...sb.map((b) => b.duree || 0));
  const sleepChart = sb.length ? `
    <div class="simple-bars" style="height:200px">${sb.map((b) => `<div title="${esc(b.label)} — ${b.n} nuit${b.n > 1 ? "s" : ""}, score ${b.score != null ? fr(b.score) : "—"}, ${fmtMin(b.duree || 0)}">
      <b style="color:${sleepColor(b.score)}">${b.score != null ? fr(b.score) : "—"}</b>
      <span style="display:flex;flex-direction:column-reverse;width:100%;max-width:56px;gap:1px">
        ${PHASES.map(([k, , c]) => (b.ph[k] ? `<i style="height:${(b.ph[k] / maxD) * 150}px;background:${c};border-radius:2px"></i>` : "")).join("")}
        ${b.autre > 5 ? `<i style="height:${(b.autre / maxD) * 150}px;border:1px dashed #5b6170;border-radius:2px;background:none"></i>` : ""}
      </span></div>`).join("")}</div>
    <div class="simple-labels">${sb.map((b) => `<span><b>${esc(b.label)}</b>${b.duree != null ? fmtMin(b.duree).replace(" ", "") : ""}</span>`).join("")}</div>
    <div class="legend">${PHASES.map(([, l, c]) => `<span>${sw(c)}${l}</span>`).join("")}<span><span class="sw" style="border:1px dashed #5b6170;background:none"></span>Non classé</span><span>Chiffre = score</span></div>` : `<p class="empty">Pas de nuits enregistrées.</p>`;
  const sleepTable = sb.length ? `<div class="scroll-x"><table><thead><tr><th>Période</th><th>Nuits</th><th>Score</th><th>Durée</th><th>Coucher</th><th>Profond</th><th>Paradoxal</th></tr></thead><tbody>
    ${sb.slice().reverse().map((b) => `<tr><td style="font-weight:600">${esc(b.label)}</td><td>${b.n}</td><td style="font-weight:700;color:${sleepColor(b.score)}">${b.score != null ? fr(b.score) : "—"}</td>
      <td>${b.duree != null ? fmtMin(b.duree) : "—"}</td><td>${fmtBed(b.bed)}</td><td>${b.ph.profond != null ? fmtMin(b.ph.profond) : "—"}</td><td>${b.ph.paradoxal != null ? fmtMin(b.ph.paradoxal) : "—"}</td></tr>`).join("")}
    </tbody></table></div>` : "";
  const allScore = mean(nights.map((n) => n.score)), allDur = mean(nights.map((n) => n.duree_min));
  const short = nights.filter((n) => n.duree_min != null && n.duree_min < 420).length;
  const sCible = S.nut.objectifs?.sommeil;

  // ---- Nutrition
  // La journée en cours est exclue : ses repas ne sont pas encore tous notés.
  const todayOpen = S.nut.journal.has(t);
  const days = [...S.nut.journal.keys()].filter((d) => d < t).sort().map((d) => {
    const f = foodOf(d);
    const j = S.nut.journal.get(d);
    const repas = j.repas || [];
    return { date: d, ...f, nRepas: repas.length, nOk: repas.filter((r) => r.statut === "prevu" || r.statut === "modifie").length };
  });
  const nb = buckets(days).slice(S.grain === "jour" ? -14 : -12).map((b) => {
    const avg = (k) => mean(b.items.map((x) => x.m?.[k]));
    return { ...b, n: b.items.length, kcal: avg("kcal"), p: avg("p"), g: avg("g"), l: avg("l"),
      target: mean(b.items.map((x) => x.t?.kcal)), tp: mean(b.items.map((x) => x.t?.p)),
      pOk: b.items.filter((x) => x.t?.p && x.m.p >= x.t.p).length,
      repas: b.items.reduce((a, x) => a + x.nOk, 0), repasTot: b.items.reduce((a, x) => a + x.nRepas, 0) };
  });
  const maxK = Math.max(3500, ...nb.map((b) => Math.max(b.kcal || 0, b.target || 0)));
  const MAC = [["p", "Protéines", "#a78bfa", 4], ["g", "Glucides", "#f5e400", 4], ["l", "Lipides", "#ff9f5a", 9]];
  const foodChart = nb.length ? `
    <div class="simple-bars" style="height:200px">${nb.map((b) => {
      const r = b.target ? b.kcal / b.target : null;
      return `<div title="${esc(b.label)} — ${fr(b.kcal || 0)} kcal${b.target ? ` / cible ${fr(b.target)}` : ""}">
      <b style="color:${foodColor(r)}">${r != null ? Math.round(r * 100) + " %" : ""}</b>
      <span style="position:relative;display:flex;flex-direction:column-reverse;width:100%;max-width:56px;gap:1px;min-height:${b.target ? (b.target / maxK) * 150 + 6 : 0}px">
        ${MAC.map(([k, , c, f]) => (b[k] ? `<i style="height:${((b[k] * f) / maxK) * 150}px;background:${c};border-radius:2px"></i>` : "")).join("")}
        ${b.target ? `<em style="position:absolute;left:-3px;right:-3px;bottom:${(b.target / maxK) * 150}px;height:2px;background:var(--text)"></em>` : ""}
      </span></div>`;
    }).join("")}</div>
    <div class="simple-labels">${nb.map((b) => `<span><b>${esc(b.label)}</b>${fr(b.kcal || 0)}</span>`).join("")}</div>
    <div class="legend">${MAC.map(([, l, c]) => `<span>${sw(c)}${l} (kcal)</span>`).join("")}<span><span class="sw" style="height:2px;background:var(--text)"></span>Cible kcal</span><span>Chiffre = % de la cible</span></div>` : `<p class="empty">Pas de journal repas.</p>`;
  const foodTable = nb.length ? `<div class="scroll-x"><table><thead><tr><th>Période</th><th>Jours</th><th>kcal / j</th><th>Prot.</th><th>Gluc.</th><th>Lip.</th><th>Prot. ≥ cible</th><th>Repas notés</th></tr></thead><tbody>
    ${nb.slice().reverse().map((b) => `<tr><td style="font-weight:600">${esc(b.label)}</td><td>${b.n}</td>
      <td><strong style="color:${foodColor(b.target ? b.kcal / b.target : null)}">${fr(b.kcal || 0)}</strong>${b.target ? `<span class="muted"> / ${fr(b.target)}</span>` : ""}</td>
      <td>${fr(b.p || 0)} g</td><td>${fr(b.g || 0)} g</td><td>${fr(b.l || 0)} g</td>
      <td style="color:${b.pOk === b.n ? "var(--ok)" : "var(--warn)"}">${b.pOk} / ${b.n}</td><td class="muted">${b.repas} / ${b.repasTot}</td></tr>`).join("")}
    </tbody></table></div>` : "";
  const nObj = S.nut.objectifs;

  // ---- Corps : chaque balance a sa propre série (composition non comparable d'une balance à l'autre).
  const corps = S.nut.corps.slice().sort((a, b) => (a.date + (a.heure || "")).localeCompare(b.date + (b.heure || "")));
  const balances = [...new Set(corps.map((c) => c.balance))];
  const BCOL = ["#f5e400", "#4fd1c5", "#a78bfa", "#ff9f5a"];
  const bcol = (b) => BCOL[balances.indexOf(b) % BCOL.length];
  const ref = nObj?.base?.poids_kg;
  let corpsChart = `<p class="empty">Pas encore de pesée.</p>`;
  if (corps.length) {
    const ws = corps.map((c) => c.poids_kg).filter((x) => x != null).concat(ref ? [ref] : []);
    const lo = Math.min(...ws) - 0.8, hi = Math.max(...ws) + 0.8;
    const d0 = corps[0].date, d1 = corps.at(-1).date;
    const span = Math.max(U.daysBetween(d0, d1), 1);
    const X = (d) => (corps.length === 1 ? 180 : 20 + (U.daysBetween(d0, d) / span) * 320);
    const Y = (v) => 108 - ((v - lo) / (hi - lo)) * 88;
    const lines = balances.map((b) => {
      const pts = corps.filter((c) => c.balance === b && c.poids_kg != null);
      return (pts.length > 1 ? `<polyline points="${pts.map((c) => `${X(c.date)},${Y(c.poids_kg)}`).join(" ")}" fill="none" stroke="${bcol(b)}" stroke-width="2"></polyline>` : "")
        + pts.map((c) => `<circle cx="${X(c.date)}" cy="${Y(c.poids_kg)}" r="5" fill="${bcol(b)}"><title>${U.fmtShort(c.date)} · ${esc(balanceLabel(b))} : ${fr(c.poids_kg, 1)} kg</title></circle>
          <text x="${X(c.date)}" y="${Y(c.poids_kg) - 9}" text-anchor="middle" fill="#f1f2f4" font-size="11" font-weight="700">${fr(c.poids_kg, 1)}</text>
          <text x="${X(c.date)}" y="128" text-anchor="middle" fill="#9097a3" font-size="10">${U.fmtShort(c.date)}</text>`).join("");
    }).join("");
    corpsChart = `<div class="chart"><svg viewBox="0 0 360 130" role="img" aria-label="Poids : ${corps.map((c) => fr(c.poids_kg, 1)).join(", ")} kg">
      ${ref ? `<line x1="0" x2="360" y1="${Y(ref)}" y2="${Y(ref)}" stroke="#5b6170" stroke-dasharray="4 4"></line><text x="356" y="${Y(ref) + 13}" text-anchor="end" fill="#9097a3" font-size="10">référence ${fr(ref, 1)} kg</text>` : ""}
      ${lines}</svg></div>
      <div class="legend">${balances.map((b) => `<span>${sw(bcol(b))}${esc(balanceLabel(b))}</span>`).join("")}</div>`;
  }
  const last = corps.at(-1), first = corps[0];
  const corpsRows = corps.slice().reverse().map((c, i, arr) => {
    const prevSame = arr.slice(i + 1).find((x) => x.balance === c.balance);
    const dW = prevSame && c.poids_kg != null ? c.poids_kg - prevSame.poids_kg : null;
    const dG = prevSame && c.gras_pct != null && prevSame.gras_pct != null ? c.gras_pct - prevSame.gras_pct : null;
    const sign = (v, d = 1) => (v == null ? "" : `${v > 0 ? "+" : ""}${fr(v, d)}`);
    return `<tr><td style="font-weight:600">${U.fmtShort(c.date)}${c.heure ? ` <span class="xs muted">${esc(c.heure)}</span>` : ""}</td>
      <td><span style="display:inline-flex;align-items:center;gap:6px">${sw(bcol(c.balance))}${esc(balanceLabel(c.balance))}</span></td>
      <td><strong>${c.poids_kg != null ? fr(c.poids_kg, 1) + " kg" : "—"}</strong>${dW != null ? ` <span class="xs muted">${sign(dW)}</span>` : ""}</td>
      <td>${c.gras_pct != null ? fr(c.gras_pct, 1) + " %" : "—"}${dG != null ? ` <span class="xs muted">${sign(dG)}</span>` : ""}</td>
      <td>${c.muscle_kg != null ? fr(c.muscle_kg, 1) + " kg" : "—"}</td>
      <td>${c.eau_pct != null ? fr(c.eau_pct, 1) + " %" : "—"}</td>
      <td class="xs muted" title="${esc(c.note || "")}">${esc(c.conditions || c.lieu || "")}</td></tr>`;
  }).join("");

  const kpi = (v, l, col) => `<div style="display:flex;flex-direction:column"><span class="kpi" style="font-size:28px;${col ? "color:" + col : ""}">${v}</span><span class="xs muted">${l}</span></div>`;
  return `
  <section style="display:flex;flex-direction:column;gap:14px">
    <div class="card-h" style="align-items:center"><h2 class="muted">Sommeil, nutrition &amp; corps</h2>
      <div class="toggles" role="group" aria-label="Regroupement">${grainBtns}</div></div>
    <div class="row">
      <section class="card grow1" style="flex-basis:520px">
        <div class="card-h"><h2>Sommeil</h2><span class="small muted">${nights.length} nuit${nights.length > 1 ? "s" : ""} · Apple Watch</span></div>
        <div class="grid-auto" style="--min:120px;gap:12px">
          ${kpi(allScore != null ? fr(allScore) : "—", "score moyen")}${kpi(allDur != null ? fmtMin(allDur) : "—", sCible?.duree_min ? `durée moy. · cible ${fmtMin(sCible.duree_min)}` : "durée moyenne")}
          ${kpi(short, "nuits sous 7 h", short ? "var(--warn)" : "")}${kpi(fmtBed(mean(nights.map((n) => bedMinutes(n.coucher)))), "coucher moyen")}
        </div>
        ${sleepChart}${sleepTable}
      </section>
      <section class="card grow1" style="flex-basis:520px">
        <div class="card-h"><h2>Nutrition</h2><span class="small muted">${days.length} jour${days.length > 1 ? "s" : ""}${todayOpen ? " (aujourd'hui exclu, en cours)" : ""} · ${esc((nObj?.statut || "").split("—")[0].trim())}</span></div>
        <div class="grid-auto" style="--min:120px;gap:12px">
          ${kpi(fr(mean(days.map((d) => d.m?.kcal)) || 0), "kcal / jour")}${kpi(`${fr(mean(days.map((d) => d.m?.p)) || 0)} g`, "protéines / jour")}
          ${kpi(`${days.filter((d) => d.t?.p && d.m.p >= d.t.p).length} / ${days.length}`, "jours protéines ≥ cible")}
          ${kpi(`${days.filter((d) => d.ratio != null && d.ratio >= 0.9 && d.ratio <= 1.1).length} / ${days.length}`, "jours à ±10 % des kcal")}
        </div>
        ${foodChart}${foodTable}
      </section>
    </div>
    <section class="card">
      <div class="card-h"><h2>Poids &amp; composition</h2><span class="small muted">${corps.length} pesée${corps.length > 1 ? "s" : ""}${balances.length > 1 ? ` · ${balances.length} balances` : ""}</span></div>
      <div class="row" style="gap:24px">
        <div class="grow1" style="display:flex;flex-direction:column;gap:12px;flex-basis:360px">
          <div class="grid-auto" style="--min:120px;gap:12px">
            ${kpi(last?.poids_kg != null ? fr(last.poids_kg, 1) + " kg" : "—", last ? `dernière pesée · ${U.fmtShort(last.date)}` : "dernière pesée")}
            ${kpi(first && last && first !== last ? `${last.poids_kg - first.poids_kg > 0 ? "+" : ""}${fr(last.poids_kg - first.poids_kg, 1)} kg` : "—", first && last && first !== last ? `depuis le ${U.fmtShort(first.date)}` : "variation")}
            ${kpi(ref ? fr(ref, 1) + " kg" : "—", "poids de référence (nutrition)")}
          </div>
          ${corpsChart}
        </div>
        <div class="grow2 scroll-x" style="flex-basis:560px"><table><thead><tr><th>Date</th><th>Balance</th><th>Poids</th><th>% gras</th><th>Muscle</th><th>Eau</th><th>Conditions</th></tr></thead><tbody>${corpsRows || `<tr><td colspan="7" class="muted">Aucune pesée.</td></tr>`}</tbody></table></div>
      </div>
      <p class="small muted" style="margin:0">Le poids se compare d'une balance à l'autre ; le % de gras, le muscle et l'eau seulement sur la même balance (écart affiché par rapport à la pesée précédente sur cette balance). Pour suivre une tendance, pèse-toi dans les mêmes conditions (même balance, même moment de la journée).</p>
    </section>
  </section>`;
}

// ---------------------------------------------------------------- réglages

function viewReglages() {
  const c = S.cfg;
  return `
  <h1>Réglages</h1>
  ${S.error ? `<div class="alert">${esc(S.error)}</div>` : ""}
  <div class="row">
    <form id="dsettings" class="card form grow1">
      <label>Compte GitHub<input name="owner" value="${esc(c.owner)}" autocomplete="off"></label>
      <label>Repo des données<input name="repo" value="${esc(c.repo)}" autocomplete="off"></label>
      <label>Branche<input name="branch" value="${esc(c.branch)}" autocomplete="off"></label>
      <label>Token GitHub<input name="token" type="password" value="${esc(c.token)}" autocomplete="off" placeholder="github_pat_…"></label>
      <button class="dbtn" type="submit" style="min-height:48px;justify-content:center">Enregistrer et synchroniser</button>
    </form>
    <div class="card grow1">
      <h2>Le token</h2>
      <p style="margin:0">Cette page est en lecture seule : un token avec <strong>Contents : Read-only</strong> sur hyrox-data suffit. Tu peux réutiliser celui du téléphone ou en créer un dédié à l'ordinateur.</p>
      <ol style="margin:0;padding-left:20px;color:var(--soft)">
        <li>github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.</li>
        <li>Repository access : Only select repositories → hyrox-data.</li>
        <li>Permissions → Repository → Contents : Read-only.</li>
      </ol>
      <p class="small muted" style="margin:0">Le token reste dans ce navigateur uniquement. Données : ${esc(c.owner)}/${esc(c.repo)} · ${S.logs.length} séances chargées.</p>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- routeur

function nav(active) {
  const t = today();
  const items = [
    ["saison", "Saison", "#/saison"],
    ["mois", "Mois", `#/mois/${S.pos.month || monthOf(t)}`],
    ["semaine", "Semaine", `#/semaine/${S.pos.week || U.mondayOf(t)}`],
    ["seance", "Séance", `#/seance/${encodeURIComponent(S.pos.seance || S.logs.filter((l) => l.date <= t).at(-1)?.id || "")}`],
    ["analyses", "Analyses", "#/analyses"],
  ];
  document.getElementById("dnav").innerHTML = items
    .map(([k, l, h]) => `<a href="${h}" class="${k === active ? "on" : ""}">${l}</a>`).join("");
}

function render() {
  const [, route = "saison", arg = ""] = (location.hash || "#/saison").split("/");
  const id = decodeURIComponent(arg);
  nav(route);
  if (route === "reglages" || !S.cfg.token) {
    $view.innerHTML = viewReglages();
    document.getElementById("dsettings").onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      S.cfg = { ...S.cfg, ...Object.fromEntries([...f.entries()].map(([k, v]) => [k, String(v).trim()])) };
      saveConfig(S.cfg);
      location.hash = "#/saison";
      loadAll();
    };
    return;
  }
  if (!S.loaded) {
    $view.innerHTML = S.error ? `<div class="alert">${esc(S.error)}</div>` : `<p class="empty">Chargement des données…</p>`;
    return;
  }
  const views = { saison: viewSaison, mois: viewMois, semaine: viewSemaine, seance: viewSeance, analyses: viewAnalyses };
  $view.innerHTML = (views[route] || viewSaison)(id);
  const sel = document.getElementById("ex-select");
  if (sel) sel.onchange = () => { S.analysisEx = sel.value; render(); };
  const stSel = document.getElementById("st-from");
  if (stSel) stSel.onchange = () => { const y = window.scrollY; S.stFrom = stSel.value; render(); window.scrollTo(0, y); };
}

$view.addEventListener("click", (e) => {
  const g = e.target.closest("[data-grain]");
  if (g) {
    S.grain = g.dataset.grain;
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
    return;
  }
  const b = e.target.closest("[data-toggle]");
  if (!b) return;
  S.show[b.dataset.toggle] = !S.show[b.dataset.toggle];
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
});
window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
document.getElementById("drefresh").onclick = () => loadAll();

render();
loadAll();
