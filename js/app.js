import { Store, StoreError, loadConfig, saveConfig, clearCache } from "./store.js";
import * as U from "./util.js";
import { renderProgress } from "./charts.js";
import { OTHER, fillPicker, pickLabel, textInput, durationInput } from "./pickers.js";
import { ingestNutrition, renderNutrition } from "./nutrition.js";

// ---------------------------------------------------------------- état global

export const APP_VERSION = "v2.5";

const S = {
  cfg: loadConfig(),
  store: null,
  ex: new Map(),        // id -> exercice du catalogue
  cat: { categories: {}, exercices: [] },
  plan: { sessions: [] },
  logs: [],             // triés du plus récent au plus ancien
  logPaths: new Map(),  // id -> chemin du fichier
  profil: null,
  objectifs: null,
  loadedAt: 0,
  loading: false,
};

const TYPE_LABEL = {
  course: "Course", muscu: "Muscu", hyrox: "Hyrox", foot: "Foot", repos: "Repos",
  test: "Test", mobilite: "Mobilité", course_officielle: "Course officielle", autre: "Autre",
};
const STATUS_ICON = { fait: "✅", modifie: "🟡", saute: "⏭️" };
const STATUS_LABEL = { fait: "Faite", modifie: "Modifiée", saute: "Sautée" };
const METRIC = {
  reps: { label: "Reps", short: "" },
  weight_kg: { label: "Kg", short: "kg" },
  distance_m: { label: "Mètres", short: "m" },
  duration_s: { label: "Temps", short: "" },
  speed_kmh: { label: "km/h", short: "km/h" },
};

const $view = document.getElementById("view");
const today = () => U.isoDate();
const exName = (it) => it.label || S.ex.get(it.exercise)?.name || it.exercise;
const metricsOf = (id) => S.ex.get(id)?.metrics || ["reps", "weight_kg"];

// ---------------------------------------------------------------- chargement

async function loadAll({ silent = false } = {}) {
  if (!S.cfg.token) {
    location.hash = "#/settings";
    return;
  }
  S.loading = true;
  if (!silent) setStatus("Synchronisation…");
  try {
    S.store = new Store(S.cfg);
    const files = await S.store.listFiles();
    const core = ["catalogue/exercices.json", "plan/plan.json", "profil/athlete.json", "profil/objectifs.json"];
    const logFiles = files.filter((p) => p.startsWith("logs/") && p.endsWith(".json"));
    const nutFiles = files.filter((p) => p.startsWith("nutrition/") && p.endsWith(".json"));
    const data = await S.store.readMany([...core, ...logFiles, ...nutFiles]);
    ingestNutrition(S, data, nutFiles);

    S.cat = data.get(core[0]) || S.cat;
    S.ex = new Map(S.cat.exercices.map((e) => [e.id, e]));
    S.plan = data.get(core[1]) || { sessions: [] };
    S.profil = data.get(core[2]);
    S.objectifs = data.get(core[3]);
    S.logs = [];
    S.logPaths.clear();
    for (const p of logFiles) {
      const log = data.get(p);
      if (!log) continue;
      S.logs.push(log);
      S.logPaths.set(log.id, p);
    }
    sortLogs();
    S.loadedAt = Date.now();
    setStatus(S.store.offline ? "Hors ligne — dernières données connues. Les saisies restent en brouillon." : "", S.store.offline);
  } catch (e) {
    console.error(e);
    setStatus(e instanceof StoreError ? e.message : "Hors ligne — données non synchronisées", true);
  } finally {
    S.loading = false;
    render();
  }
}

function sortLogs() {
  S.logs.sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
}

function setStatus(msg, isError = false) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = "status" + (msg ? " show" : "") + (isError ? " error" : "");
}

function toast(msg, isError = false) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.className = "toast"), 2800);
}

const logByPlan = () => new Map(S.logs.filter((l) => l.plan_id).map((l) => [l.plan_id, l]));

// ---------------------------------------------------------------- rendu commun

function fmtSet(s, metrics) {
  const parts = [];
  for (const m of metrics) {
    const v = s[m];
    if (v == null || v === "") continue;
    if (m === "reps") parts.push(`${v}`);
    else if (m === "duration_s") parts.push(U.fmtDuration(v));
    else parts.push(`${String(v).replace(".", ",")} ${METRIC[m].short}`);
  }
  if (s.reps != null && parts.length > 1) return `${parts[0]} × ${parts.slice(1).join(" · ")}`;
  return parts.join(" · ") || "—";
}

// Regroupe les séries identiques : "4 × 10 × 25 kg"
function fmtSets(sets, metrics) {
  if (!sets?.length) return "";
  const labels = sets.map((s) => fmtSet(s, metrics));
  if (labels.every((l) => l === labels[0])) {
    return sets.length > 1 ? `${sets.length} séries · ${labels[0]}` : labels[0];
  }
  return labels.join(" · ");
}

function badge(type) {
  return `<span class="badge t-${type}">${TYPE_LABEL[type] || type}</span>`;
}

function sessionCard(s, log) {
  const status = log ? `<span class="st">${STATUS_ICON[log.status] || ""}</span>` : "";
  const meta = [
    s.when || "",
    s.duration_min ? `${s.duration_min} min` : "",
    s.rpe_target && s.rpe_target !== "—" ? `RPE ${s.rpe_target}` : "",
  ].filter(Boolean).join(" · ");
  return `<a class="card session" href="#/session/${encodeURIComponent(s.id)}">
    <div class="row">${badge(s.type)}${status}</div>
    <h3>${U.esc(s.title)}</h3>
    ${meta ? `<p class="meta">${U.esc(meta)}</p>` : ""}
    ${s.attention ? `<p class="warn">⚠️ ${U.esc(s.attention)}</p>` : ""}
  </a>`;
}

function logRow(l) {
  return `<a class="logrow" href="#/log/${encodeURIComponent(l.id)}">
    <span class="d">${U.fmtShort(l.date)}</span>
    <span class="t">${U.esc(l.title)}${l.approx ? ' <span class="approx">≈</span>' : ""}</span>
    <span class="r">${l.rpe != null ? `RPE ${l.rpe}` : ""} ${STATUS_ICON[l.status] || ""}</span>
  </a>`;
}

function blocksView(blocks, { withPlan = false } = {}) {
  return (blocks || []).map((b) => `
    <section class="block">
      <h4>${U.esc(b.name)}</h4>
      ${(b.items || []).map((it) => {
        const metrics = metricsOf(it.exercise);
        let setsHtml;
        if (withPlan) {
          setsHtml = (it.sets || []).map((s, i) => {
            const diff = s.plan && fmtSet(s.plan, metrics) !== fmtSet(s, metrics)
              ? ` <span class="plan">(prévu ${fmtSet(s.plan, metrics)})</span>` : "";
            return `<li class="${s.done === false ? "undone" : ""}">S${i + 1} · ${fmtSet(s, metrics)}${diff}</li>`;
          }).join("");
          setsHtml = `<ul class="sets">${setsHtml}</ul>`;
        } else {
          setsHtml = `<p class="sets-sum">${fmtSets(it.sets, metrics)}</p>`;
        }
        return `<div class="item">
          <div class="item-h">${it.group ? `<span class="group">${U.esc(it.group)}</span>` : ""}
            <strong>${U.esc(exName(it))}</strong></div>
          ${setsHtml}
          ${it.target ? `<p class="meta">🎯 ${U.esc(it.target)}</p>` : ""}
          ${it.note ? `<p class="meta">📝 ${U.esc(it.note)}</p>` : ""}
        </div>`;
      }).join("")}
    </section>`).join("");
}

// ---------------------------------------------------------------- vues

function viewToday() {
  const t = today();
  const byPlan = logByPlan();
  const sessions = [...S.plan.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const todays = sessions.filter((s) => s.date === t);
  const next = sessions.filter((s) => s.date > t).slice(0, 4);
  const missing = sessions.filter((s) => s.date < t && U.daysBetween(s.date, t) <= 7 && !byPlan.has(s.id)
    && s.type !== "repos");
  const race = S.objectifs?.course;
  const countdown = race ? U.daysBetween(t, race.date) : null;

  return `
    ${race && countdown >= 0 ? `<div class="hero">
      <div class="big">J-${countdown}</div>
      <div><strong>${U.esc(race.nom)}</strong><br><span class="meta">${U.fmtDay(race.date, true)}</span></div>
    </div>` : ""}
    ${S.plan.message_coach ? `<div class="coach">🧠 ${U.esc(S.plan.message_coach)}</div>` : ""}
    <h2>Aujourd'hui <span class="meta">${U.fmtDay(t, true)}</span></h2>
    ${todays.length ? todays.map((s) => sessionCard(s, byPlan.get(s.id))).join("")
      : `<p class="empty">Rien de prévu aujourd'hui.</p>`}
    ${missing.length ? `<h2>À saisir</h2>${missing.map((s) => sessionCard(s)).join("")}` : ""}
    <h2>À venir</h2>
    ${next.length ? next.map((s) => `<div class="dayline">${U.fmtDay(s.date)}</div>${sessionCard(s, byPlan.get(s.id))}`).join("")
      : `<p class="empty">Aucune séance planifiée. Demande au coach !</p>`}
    <a class="btn ghost wide" href="#/edit/new">+ Saisir une séance libre</a>
  `;
}

function viewWeek(start) {
  const monday = U.mondayOf(start || today());
  const byPlan = logByPlan();
  const days = Array.from({ length: 7 }, (_, i) => U.addDays(monday, i));
  const planIds = new Set(S.plan.sessions.map((s) => s.id));
  const html = days.map((d) => {
    const planned = S.plan.sessions.filter((s) => s.date === d);
    const free = S.logs.filter((l) => l.date === d && !(l.plan_id && planIds.has(l.plan_id)));
    const entries = [
      ...planned.map((s) => {
        const log = byPlan.get(s.id);
        return `<a class="wk-item" href="#/session/${encodeURIComponent(s.id)}">
          ${badge(s.type)} <span>${U.esc(s.title)}</span> <span class="st">${log ? STATUS_ICON[log.status] : ""}</span></a>`;
      }),
      ...free.map((l) => `<a class="wk-item done" href="#/log/${encodeURIComponent(l.id)}">
          ${badge(l.type)} <span>${U.esc(l.title)}</span> <span class="st">${STATUS_ICON[l.status] || ""}</span></a>`),
    ];
    return `<div class="wk-day ${d === today() ? "is-today" : ""}">
      <div class="wk-d">${U.fmtDay(d)}</div>
      <div class="wk-list">${entries.join("") || '<span class="meta">—</span>'}</div>
    </div>`;
  }).join("");
  return `
    <div class="weeknav">
      <a class="btn small ghost" href="#/week/${U.addDays(monday, -7)}">←</a>
      <h2>Semaine du ${U.fmtShort(monday)}</h2>
      <a class="btn small ghost" href="#/week/${U.addDays(monday, 7)}">→</a>
    </div>
    ${S.plan.semaine && monday <= today() && today() < U.addDays(monday, 7) ? `<p class="meta center">${U.esc(S.plan.semaine)}</p>` : ""}
    ${html}`;
}

function viewSession(id) {
  const s = S.plan.sessions.find((x) => x.id === id);
  if (!s) return `<p class="empty">Séance introuvable (le programme a peut-être changé).</p>`;
  const log = logByPlan().get(s.id);
  const info = [
    ["Objectif", s.objective], ["Intensité", s.intensity], ["Lieu", s.location],
    ["Durée", s.duration_min ? `${s.duration_min} min` : ""], ["RPE cible", s.rpe_target],
  ].filter(([, v]) => v && v !== "—");
  return `
    <a class="back" href="#/today">← Retour</a>
    <div class="row">${badge(s.type)}<span class="meta">${U.fmtDay(s.date, true)}${s.when ? ` · ${U.esc(s.when)}` : ""}</span></div>
    <h1>${U.esc(s.title)}</h1>
    ${s.attention ? `<p class="warn">⚠️ ${U.esc(s.attention)}</p>` : ""}
    <dl class="info">${info.map(([k, v]) => `<dt>${k}</dt><dd>${U.esc(v)}</dd>`).join("")}</dl>
    ${blocksView(s.blocks)}
    <div class="actions">
      ${log ? `<a class="btn" href="#/log/${encodeURIComponent(log.id)}">${STATUS_ICON[log.status]} Voir ma saisie</a>`
        : `<a class="btn" href="#/edit/plan/${encodeURIComponent(s.id)}">▶︎ Saisir cette séance</a>`}
    </div>`;
}

function viewLog(id) {
  const l = S.logs.find((x) => x.id === id);
  if (!l) return `<p class="empty">Séance introuvable.</p>`;
  const stats = [
    ["Statut", `${STATUS_ICON[l.status] || ""} ${STATUS_LABEL[l.status] || l.status}`],
    ["RPE", l.rpe], ["Sensations", l.feeling != null ? `${l.feeling}/10` : null],
    ["Durée", l.duration_min ? `${l.duration_min} min` : null],
    ["FC moy / max", l.hr_avg || l.hr_max ? `${l.hr_avg ?? "—"} / ${l.hr_max ?? "—"}` : null],
  ].filter(([, v]) => v != null && v !== "");
  return `
    <a class="back" href="javascript:history.back()">← Retour</a>
    <div class="row">${badge(l.type)}<span class="meta">${U.fmtDay(l.date, true)}</span>
      ${l.approx ? '<span class="approx-badge">≈ import Excel</span>' : ""}</div>
    <h1>${U.esc(l.title)}</h1>
    <div class="stats">${stats.map(([k, v]) => `<div><span>${k}</span><strong>${U.esc(v)}</strong></div>`).join("")}</div>
    ${l.pain ? `<div class="box pain"><span>Douleurs</span>${U.nl2br(l.pain)}</div>` : ""}
    ${l.comment ? `<div class="box"><span>Commentaire</span>${U.nl2br(l.comment)}</div>` : ""}
    ${l.coach_note ? `<div class="box coachnote"><span>🧠 Coach</span>${U.nl2br(l.coach_note)}</div>` : ""}
    ${blocksView(l.blocks, { withPlan: true })}
    ${l.text ? `<details class="box"><summary>Texte d'origine (Excel)</summary>${U.nl2br(l.text)}</details>` : ""}
    <div class="actions"><a class="btn ghost" href="#/edit/log/${encodeURIComponent(l.id)}">✏️ Modifier</a></div>`;
}

let historyFilter = "all";
function viewHistory() {
  const filters = [["all", "Tout"], ["muscu", "Muscu"], ["course", "Course"], ["hyrox", "Hyrox"],
    ["foot", "Foot"], ["autre", "Autres"]];
  const match = (l) => historyFilter === "all" || l.type === historyFilter
    || (historyFilter === "hyrox" && l.type === "course_officielle")
    || (historyFilter === "autre" && ["autre", "repos", "test", "mobilite"].includes(l.type));
  const logs = S.logs.filter(match);
  let month = "";
  const rows = logs.map((l) => {
    const m = U.fmtMonth(l.date);
    const head = m !== month ? `<h3 class="month">${(month = m)}</h3>` : "";
    return head + logRow(l);
  }).join("");
  return `
    <h1>Historique <span class="meta">${S.logs.length} séances</span></h1>
    <div class="chips">${filters.map(([k, v]) =>
      `<button class="chip ${k === historyFilter ? "on" : ""}" data-filter="${k}">${v}</button>`).join("")}</div>
    ${rows || '<p class="empty">Aucune séance.</p>'}
    <p class="meta center">≈ = importée de l'Excel (données approximatives)</p>`;
}

function viewGoals() {
  const o = S.objectifs;
  const p = S.profil;
  if (!o) return `<p class="empty">Objectifs non chargés.</p>`;
  const t = today();
  const phase = o.phases.find((ph) => ph.debut <= t && t <= ph.fin);
  return `
    <h1>Objectifs</h1>
    <div class="hero"><div class="big">J-${U.daysBetween(t, o.course.date)}</div>
      <div><strong>${U.esc(o.course.nom)}</strong><br><span class="meta">${U.fmtDay(o.course.date, true)} · avec ${U.esc(o.course.partenaire)}</span></div></div>
    <div class="stats">${o.cibles.filter((c) => c.valeur.length <= 14).map((c) => `<div><span>${U.esc(c.label)}</span><strong>${U.esc(c.valeur)}</strong></div>`).join("")}</div>
    ${o.cibles.filter((c) => c.valeur.length > 14).map((c) => `<p class="meta">${U.esc(c.label)} : ${U.esc(c.valeur)}</p>`).join("")}

    <h2>Mes objectifs</h2>
    <table class="tbl"><tr><th></th><th>Actuel</th><th>Cible</th></tr>
      ${o.objectifs_perso.map((x) => `<tr><td>${U.esc(x.label)}</td><td>${U.esc(x.actuel)}</td><td><strong>${U.esc(x.cible)}</strong></td></tr>`).join("")}
    </table>

    <h2>Phases</h2>
    <div class="phases">${o.phases.map((ph) => `<div class="phase ${ph === phase ? "on" : ph.fin < t ? "past" : ""}">
      <strong>${U.esc(ph.nom)}</strong><span class="meta">${U.fmtShort(ph.debut)} → ${U.fmtShort(ph.fin)} · ${U.esc(ph.focus)}</span></div>`).join("")}</div>

    <h2>Références course</h2>
    <div class="scroll-x"><table class="tbl">
      <tr><th></th>${o.references.colonnes.map((c) => `<th>${U.esc(c)}</th>`).join("")}</tr>
      ${o.references.segments.map((s) => `<tr><td>${U.esc(s.segment)}</td>${s.valeurs.map((v) => `<td>${U.esc(v)}</td>`).join("")}</tr>`).join("")}
    </table></div>
    <p class="meta">${U.esc(o.references.note || "")}</p>

    ${p ? `<h2>Allures de référence</h2>
    <div class="scroll-x"><table class="tbl"><tr><th></th><th>Ph. 1</th><th>Ph. 4</th><th>Ph. 5</th></tr>
      ${p.allures.map((a) => `<tr><td>${U.esc(a.type)}<br><span class="meta">${U.esc(a.note)}</span></td><td>${a.phase1}</td><td>${a.phase4}</td><td>${a.phase5}</td></tr>`).join("")}
    </table></div>
    <h2>Profil</h2>
    <div class="stats">
      <div><span>VMA</span><strong>${p.vma_kmh} km/h</strong></div>
      <div><span>FC max</span><strong>${p.fc_max}</strong></div>
      <div><span>Z2 max</span><strong>${p.fc_z2_max} bpm</strong></div>
      <div><span>Poids</span><strong>${p.poids_kg} kg</strong></div>
    </div>
    ${p.blessures.map((b) => `<div class="box ${b.statut === "Récupéré" ? "" : "pain"}"><span>${U.esc(b.zone)} — ${U.esc(b.statut)}</span>${U.esc(b.note)}</div>`).join("")}` : ""}
  `;
}

function viewSettings() {
  const c = S.cfg;
  return `
    <h1>Réglages</h1>
    <form id="settings" class="form">
      <label>Compte GitHub<input name="owner" value="${U.esc(c.owner)}" autocapitalize="off" autocorrect="off"></label>
      <label>Repo des données<input name="repo" value="${U.esc(c.repo)}" autocapitalize="off" autocorrect="off"></label>
      <label>Branche<input name="branch" value="${U.esc(c.branch)}" autocapitalize="off"></label>
      <label>Token GitHub<input name="token" type="password" value="${U.esc(c.token)}" autocomplete="off" placeholder="github_pat_…"></label>
      <button class="btn wide" type="submit">Enregistrer et synchroniser</button>
    </form>
    <details class="box"><summary>Comment créer le token ?</summary>
      <ol>
        <li>github.com → photo de profil → <b>Settings</b> → <b>Developer settings</b> → <b>Personal access tokens</b> → <b>Fine-grained tokens</b> → <b>Generate new token</b>.</li>
        <li>Expiration : 1 an. <b>Repository access</b> : <i>Only select repositories</i> → <b>hyrox-data</b> uniquement.</li>
        <li><b>Permissions → Repository → Contents : Read and write</b>. Rien d'autre.</li>
        <li>Copie le token et colle-le ici. Il reste uniquement sur ce téléphone.</li>
      </ol>
      Si tu perds ton téléphone : révoque le token sur GitHub.
    </details>
    <button class="btn ghost wide" id="clearcache">Vider le cache local</button>
    <p class="meta center">Données : ${U.esc(c.owner)}/${U.esc(c.repo)} · ${S.logs.length} séances chargées</p>
    <p class="meta center">Version de l'app : <strong>${APP_VERSION}</strong></p>
    <p class="meta center">Sur ordinateur : <a href="desktop.html" class="linkbtn">desktop.html</a></p>`;
}

// ---------------------------------------------------------------- saisie

let ED = null; // séance en cours d'édition

const draftKey = (key) => `hyrox:draft:${key}`;

function planToLog(s) {
  const log = U.clone(s);
  for (const k of ["when", "rpe_target", "objective", "intensity", "attention", "location"]) delete log[k];
  log.plan_id = s.id;
  log.status = "fait";
  log.source = "app";
  for (const b of log.blocks || []) {
    for (const it of b.items || []) {
      it.sets = (it.sets || []).map((st) => ({ ...st, plan: { ...st }, done: false }));
    }
  }
  if (!log.blocks?.length) log.blocks = [{ name: "Corps de séance", items: [] }];
  return log;
}

function openEditor(kind, id) {
  const key = `${kind}:${id || "new"}`;
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(draftKey(key)) || "null"); } catch { draft = null; }
  let log;
  let path = null;
  if (kind === "plan") {
    const s = S.plan.sessions.find((x) => x.id === id);
    if (!s) return null;
    log = planToLog(s);
  } else if (kind === "log") {
    const l = S.logs.find((x) => x.id === id);
    if (!l) return null;
    log = U.clone(l);
    path = S.logPaths.get(l.id);
  } else {
    log = {
      id: null, date: today(), title: "Séance libre", type: "autre", status: "fait",
      source: "app", blocks: [{ name: "Corps de séance", items: [] }],
    };
  }
  ED = { key, kind, path, log: draft?.log || log, restored: !!draft, statusTouched: draft?.statusTouched || kind === "log" };
  return ED;
}

function saveDraft() {
  if (!ED) return;
  try {
    localStorage.setItem(draftKey(ED.key), JSON.stringify({ log: ED.log, statusTouched: ED.statusTouched }));
  } catch { /* ignore */ }
}

function setInput(m, s) {
  if (m === "duration_s") return durationInput(s[m]);
  const v = s[m];
  const label = v == null ? "—" : pickLabel(m, v);
  return `<select class="num pick ${v == null ? "empty" : ""}" data-m="${m}" data-v="${v ?? ""}">
    <option value="${v ?? ""}" selected>${label}</option></select>`;
}

function viewEditor() {
  const l = ED.log;
  const isPlan = !!l.plan_id;
  const typeOpts = Object.entries(TYPE_LABEL).map(([k, v]) =>
    `<option value="${k}" ${l.type === k ? "selected" : ""}>${v}</option>`).join("");
  const exOptions = Object.entries(S.cat.categories).map(([cat, label]) =>
    `<optgroup label="${U.esc(label)}">${S.cat.exercices.filter((e) => e.category === cat)
      .map((e) => `<option value="${e.id}">${U.esc(e.name)}</option>`).join("")}</optgroup>`).join("");

  const blocks = l.blocks.map((b, bi) => `
    <section class="block">
      <h4>${U.esc(b.name)}</h4>
      ${b.items.map((it, ii) => {
        const metrics = metricsOf(it.exercise);
        const allDone = it.sets.length && it.sets.every((s) => s.done);
        return `<div class="item edit" data-b="${bi}" data-i="${ii}">
          <div class="item-h">
            <div>${it.group ? `<span class="group">${U.esc(it.group)}</span>` : ""}<strong>${U.esc(exName(it))}</strong></div>
            <button class="icon" data-act="del-item" title="Retirer">✕</button>
          </div>
          ${it.note || it.target ? `<p class="meta">${[it.target && `🎯 ${U.esc(it.target)}`, it.note && `📝 ${U.esc(it.note)}`].filter(Boolean).join(" · ")}</p>` : ""}
          <div class="setgrid" style="--cols:${metrics.length}">
            <span class="h">#</span>${metrics.map((m) => `<span class="h">${METRIC[m].label}</span>`).join("")}<span class="h"></span>
            ${it.sets.map((s, si) => `
              <span class="idx">${si + 1}</span>
              ${metrics.map((m) => `<span data-s="${si}">${setInput(m, s)}</span>`).join("")}
              <button class="check ${s.done ? "on" : ""}" data-act="toggle" data-s="${si}" aria-label="Série faite">✓</button>
            `).join("")}
          </div>
          <div class="item-actions">
            <button class="btn small ghost" data-act="add-set">+ série</button>
            ${it.sets.length > 1 ? `<button class="btn small ghost" data-act="del-set">− série</button>` : ""}
            ${it.sets.length ? `<button class="btn small ${allDone ? "ghost" : ""}" data-act="all-done">${allDone ? "Tout décocher" : "✓ Tout valider"}</button>` : ""}
          </div>
        </div>`;
      }).join("")}
      <select class="add-ex" data-b="${bi}"><option value="">+ Ajouter un exercice…</option>${exOptions}</select>
    </section>`).join("");

  const chips = (field, val) => Array.from({ length: 10 }, (_, i) => i + 1).map((n) =>
    `<button class="chip num ${val === n ? "on" : ""}" data-act="chip" data-field="${field}" data-v="${n}">${n}</button>`).join("");

  return `
    <a class="back" href="javascript:history.back()">← Annuler</a>
    ${ED.restored ? `<div class="coach">📝 Brouillon restauré. <button class="linkbtn" data-act="reset-draft">Repartir de zéro</button></div>` : ""}
    <div class="form">
      ${isPlan ? `<h1>${U.esc(l.title)}</h1>` : `<label>Titre<input data-field="title" value="${U.esc(l.title)}"></label>`}
      <div class="two">
        <label>Date<input type="date" data-field="date" value="${l.date}"></label>
        <label>Type<select data-field="type">${typeOpts}</select></label>
      </div>
    </div>
    <p class="meta">Les valeurs prévues sont pré-remplies : coche ✓ si c'est fait, touche une valeur pour la changer (« Autre… » en bas du menu pour la taper au clavier).</p>
    ${blocks}
    <section class="block form">
      <h4>Bilan</h4>
      <label>RPE (effort ressenti)</label><div class="chips">${chips("rpe", l.rpe)}</div>
      <label>Sensations</label><div class="chips">${chips("feeling", l.feeling)}</div>
      <div class="three">
        <label>Durée (min)<input data-field="duration_min" inputmode="numeric" value="${l.duration_min ?? ""}"></label>
        <label>FC moy<input data-field="hr_avg" inputmode="numeric" value="${l.hr_avg ?? ""}"></label>
        <label>FC max<input data-field="hr_max" inputmode="numeric" value="${l.hr_max ?? ""}"></label>
      </div>
      <label>Douleurs / gênes<input data-field="pain" value="${U.esc(l.pain ?? "")}" placeholder="Rien à signaler"></label>
      <label>Commentaire pour le coach<textarea data-field="comment" rows="3">${U.esc(l.comment ?? "")}</textarea></label>
      <label>Statut</label>
      <div class="chips">${Object.entries(STATUS_LABEL).map(([k, v]) =>
        `<button class="chip ${l.status === k ? "on" : ""}" data-act="status" data-v="${k}">${STATUS_ICON[k]} ${v}</button>`).join("")}</div>
    </section>
    <div class="savebar"><button class="btn wide" data-act="save">Enregistrer la séance</button></div>`;
}

function autoStatus(log) {
  const sets = log.blocks.flatMap((b) => b.items.flatMap((i) => i.sets));
  if (!sets.length) return "fait";
  const done = sets.filter((s) => s.done);
  if (!done.length) return "saute";
  const same = (s) => !s.plan || Object.keys(s.plan).every((k) => s.plan[k] == null || s.plan[k] === s[k]);
  return done.length === sets.length && sets.every(same) ? "fait" : "modifie";
}

function cleanLog(log) {
  const out = U.clone(log);
  for (const b of out.blocks) {
    for (const it of b.items) {
      it.sets = it.sets.map((s) => {
        const c = {};
        for (const [k, v] of Object.entries(s)) {
          if (v === null || v === "" || v === undefined) continue;
          c[k] = v;
        }
        if (c.plan && !Object.keys(c.plan).length) delete c.plan;
        return c;
      });
    }
    b.items = b.items.filter((it) => it.sets.length);
  }
  out.blocks = out.blocks.filter((b) => b.items.length);
  for (const k of Object.keys(out)) if (out[k] === null || out[k] === "") delete out[k];
  out.updated_at = new Date().toISOString();
  return out;
}

async function saveEditor(btn) {
  const l = ED.log;
  if (!l.date || !l.title) return toast("Date et titre obligatoires", true);
  if (!ED.statusTouched) l.status = autoStatus(l);
  if (!l.id) {
    const base = `${l.date}-${U.slug(l.title)}`;
    let id = base;
    for (let n = 2; S.logs.some((x) => x.id === id); n++) id = `${base}-${n}`;
    l.id = id;
  }
  const log = cleanLog(l);
  const path = ED.path || `logs/${log.date.slice(0, 4)}/${log.id}.json`;
  btn.disabled = true;
  btn.textContent = "Enregistrement…";
  try {
    // Conflit = le coach a modifié ce log entre-temps : on garde sa note.
    const keepCoach = (remote, mine) => (remote.coach_note ? Object.assign(mine, { coach_note: remote.coach_note }) : mine);
    await S.store.writeJSON(path, log, `séance: ${log.date} ${log.title}`, keepCoach);
    S.logs = S.logs.filter((x) => x.id !== log.id);
    S.logs.push(log);
    S.logPaths.set(log.id, path);
    sortLogs();
    localStorage.removeItem(draftKey(ED.key));
    ED = null;
    toast("✅ Séance enregistrée");
    location.replace(`#/log/${encodeURIComponent(log.id)}`);
  } catch (e) {
    console.error(e);
    saveDraft();
    btn.disabled = false;
    btn.textContent = "Réessayer l'enregistrement";
    const why = e instanceof StoreError ? e.message : "Pas de réseau";
    toast(`${why} — brouillon conservé, réessaie plus tard`, true);
  }
}

function itemAt(el) {
  const box = el.closest(".item.edit");
  return box ? ED.log.blocks[+box.dataset.b].items[+box.dataset.i] : null;
}

function bindEditor() {
  $view.oninput = (e) => {
    const t = e.target;
    if (t.dataset.field) {
      const f = t.dataset.field;
      const numeric = ["duration_min", "hr_avg", "hr_max"].includes(f);
      ED.log[f] = numeric ? U.parseNum(t.value) : t.value;
    } else if (t.dataset.m) {
      if (t.value === OTHER) return; // géré par onchange
      const it = itemAt(t);
      const si = +t.closest("[data-s]").dataset.s;
      const m = t.dataset.m;
      if (t.dataset.pick?.startsWith("dur_")) {
        const [minSel, secSel] = t.closest(".dur").querySelectorAll("select");
        // Première roue touchée : l'autre passe à 0 au lieu de rester vide.
        for (const other of [minSel, secSel]) {
          if (other !== t && other.value === "") { fillPicker(other); other.value = "0"; }
        }
        const total = minSel.value === "" && secSel.value === "" ? null : (+minSel.value || 0) * 60 + (+secSel.value || 0);
        it.sets[si][m] = total;
        [minSel, secSel].forEach((x) => x.classList.toggle("empty", total == null));
      } else if (t.tagName === "SELECT") {
        it.sets[si][m] = U.parseNum(t.value);
        t.classList.toggle("empty", t.value === "");
      } else {
        it.sets[si][m] = m === "duration_s" ? U.parseDuration(t.value.trim().replace(/^(\d+)[.,\s](\d+)$/, (_, a, b) => `${a}:${b.padEnd(2, "0")}`)) : U.parseNum(t.value);
      }
      if (!it.sets[si].done) {
        it.sets[si].done = true;
        t.closest(".setgrid").querySelector(`.check[data-s="${si}"]`)?.classList.add("on");
      }
    }
    saveDraft();
  };
  $view.onchange = (e) => {
    const t = e.target;
    if (t.classList.contains("pick") && t.value === OTHER) {
      const cell = t.parentElement;
      cell.innerHTML = textInput(t.dataset.m, itemAt(cell)?.sets[+cell.dataset.s][t.dataset.m]);
      const inp = cell.querySelector("input");
      inp.focus();
      inp.select();
      return;
    }
    if (t.classList.contains("add-ex") && t.value) {
      const ex = S.ex.get(t.value);
      ED.log.blocks[+t.dataset.b].items.push({ exercise: ex.id, sets: [{ done: false }] });
      saveDraft();
      rerenderEditor();
    }
  };
  $view.onclick = (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    e.preventDefault();
    const act = b.dataset.act;
    const it = itemAt(b);
    if (act === "toggle") {
      const s = it.sets[+b.dataset.s];
      s.done = !s.done;
      // Valider une série vide = reprendre les valeurs prévues.
      let filled = false;
      if (s.done && s.plan) for (const [k, v] of Object.entries(s.plan)) if (s[k] == null) { s[k] = v; filled = true; }
      if (filled) rerenderEditor(); else b.classList.toggle("on", s.done);
    } else if (act === "all-done") {
      const target = !it.sets.every((s) => s.done);
      it.sets.forEach((s) => {
        s.done = target;
        if (target && s.plan) for (const [k, v] of Object.entries(s.plan)) if (s[k] == null) s[k] = v;
      });
      rerenderEditor();
    } else if (act === "add-set") {
      const last = it.sets[it.sets.length - 1] || {};
      const { plan, ...vals } = last;
      it.sets.push({ ...vals, done: false });
      rerenderEditor();
    } else if (act === "del-set") {
      it.sets.pop();
      rerenderEditor();
    } else if (act === "del-item") {
      const box = b.closest(".item.edit");
      ED.log.blocks[+box.dataset.b].items.splice(+box.dataset.i, 1);
      rerenderEditor();
    } else if (act === "chip") {
      const f = b.dataset.field;
      const v = +b.dataset.v;
      ED.log[f] = ED.log[f] === v ? null : v;
      b.parentElement.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", +c.dataset.v === ED.log[f]));
    } else if (act === "status") {
      ED.log.status = b.dataset.v;
      ED.statusTouched = true;
      b.parentElement.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === b));
    } else if (act === "reset-draft") {
      localStorage.removeItem(draftKey(ED.key));
      const [kind, id] = ED.key.split(/:(.*)/);
      openEditor(kind, id === "new" ? null : id);
      ED.restored = false;
      rerenderEditor();
      return;
    } else if (act === "save") {
      saveEditor(b);
      return;
    }
    saveDraft();
  };
}

function rerenderEditor() {
  const y = $view.scrollTop;
  $view.innerHTML = viewEditor();
  $view.scrollTop = y;
}

// ---------------------------------------------------------------- routeur

// Trois espaces : le menu ☰ change d'espace, la barre du bas navigue dans l'espace.
const SPACES = {
  sport: { label: "Sport", icon: "🏋️", home: "#/today", tabs: [
    ["today", "#/today", "●", "Aujourd'hui"], ["week", "#/week", "▦", "Semaine"],
    ["history", "#/history", "☰", "Historique"], ["progress", "#/progress", "↗", "Progrès"],
    ["goals", "#/goals", "◎", "Objectifs"]] },
  nutrition: { label: "Nutrition", icon: "🥗", home: "#/n/jour", tabs: [
    ["jour", "#/n/jour", "●", "Aujourd'hui"], ["semaine", "#/n/semaine", "▦", "Menu"],
    ["courses", "#/n/courses", "✓", "Courses"], ["corps", "#/n/corps", "⚖", "Poids"],
    ["bilan", "#/n/bilan", "↗", "Bilan"]] },
  sommeil: { label: "Sommeil", icon: "😴", home: "#/s/nuit", tabs: [
    ["nuit", "#/s/nuit", "☾", "Cette nuit"], ["suivi", "#/s/suivi", "↗", "Suivi"]] },
};
let currentSpace = null;

function setSpace(space, tab) {
  const sp = SPACES[space];
  if (space !== currentSpace) {
    currentSpace = space;
    const nav = document.querySelector("nav.tabs");
    nav.style.setProperty("--n", sp.tabs.length);
    nav.innerHTML = sp.tabs.map(([id, href, ic, lab]) =>
      `<a href="${href}" data-tab="${id}"><span>${ic}</span>${lab}</a>`).join("");
    document.getElementById("space-name").textContent = sp.label.toLowerCase();
    document.querySelectorAll("#drawer [data-space]").forEach((a) => a.classList.toggle("on", a.dataset.space === space));
  }
  document.querySelectorAll("nav.tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
}
const setTab = (name) => setSpace(currentSpace || "sport", name);

// Enregistrement générique pour le volet nutrition (retourne true si OK).
const nutCtx = {
  toast,
  async save(path, obj, message) {
    try {
      await S.store.writeJSON(path, obj, message);
      toast("✅ Enregistré");
      return true;
    } catch (e) {
      toast(`${e instanceof StoreError ? e.message : "Pas de réseau"} — réessaie plus tard`, true);
      return false;
    }
  },
};

function render() {
  const [, route = "today", a, b] = location.hash.split("/");
  closeDrawer();
  $view.oninput = $view.onchange = $view.onclick = null;
  // Remplit les menus déroulants juste avant que la roue s'ouvre (pointerdown précède l'ouverture sur iOS).
  $view.onpointerdown = $view.onfocusin = (e) => {
    if (e.target.classList?.contains("pick")) fillPicker(e.target);
  };
  if (route === "settings") {
    setTab("");
    $view.innerHTML = viewSettings();
    bindSettings();
    return;
  }
  if (!S.loadedAt) {
    $view.innerHTML = S.loading ? `<p class="empty">Chargement…</p>`
      : `<p class="empty">Données non chargées. <a href="#/settings">Vérifier les réglages</a></p>`;
    return;
  }
  if (route === "n" || route === "s") {
    ED = null;
    const sub = route === "s" ? (a === "suivi" ? "suivi" : "nuit") : (a || "jour");
    setSpace(route === "s" ? "sommeil" : "nutrition", sub === "recette" ? "semaine" : sub);
    renderNutrition($view, S, nutCtx, sub, b);
    return;
  }
  const routes = {
    today: () => [viewToday(), "today"],
    week: () => [viewWeek(a), "week"],
    session: () => [viewSession(decodeURIComponent(a)), "today"],
    log: () => [viewLog(decodeURIComponent(a)), "history"],
    history: () => [viewHistory(), "history"],
    progress: () => ["", "progress"],
    goals: () => [viewGoals(), "goals"],
    edit: () => {
      const key = `${a}:${b ? decodeURIComponent(b) : "new"}`;
      if (!ED || ED.key !== key) openEditor(a, b ? decodeURIComponent(b) : null);
      return ED ? [viewEditor(), "today"] : [`<p class="empty">Séance introuvable.</p>`, "today"];
    },
  };
  const [html, tab] = (routes[route] || routes.today)();
  setSpace("sport", tab);
  if (route !== "edit") ED = null;
  $view.innerHTML = html;
  if (route === "edit" && ED) bindEditor();
  if (route === "history") {
    $view.onclick = (e) => {
      const f = e.target.closest("[data-filter]");
      if (f) { historyFilter = f.dataset.filter; render(); }
    };
  }
  if (route === "progress") renderProgress($view, S);
}

function bindSettings() {
  document.getElementById("settings").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    S.cfg = { ...S.cfg, ...Object.fromEntries([...f.entries()].map(([k, v]) => [k, String(v).trim()])) };
    saveConfig(S.cfg);
    location.hash = "#/today";
    loadAll();
  };
  document.getElementById("clearcache").onclick = () => {
    clearCache();
    toast("Cache vidé");
    loadAll();
  };
}

window.addEventListener("hashchange", () => {
  render();
  if (!location.hash.startsWith("#/edit")) $view.scrollTop = 0;
});
document.getElementById("refresh").onclick = () => loadAll();

// ---------------------------------------------------------------- volet latéral
const $drawer = document.getElementById("drawer");
function closeDrawer() { document.body.classList.remove("drawer-open"); }
document.getElementById("menu").onclick = () => document.body.classList.toggle("drawer-open");
document.getElementById("scrim").onclick = closeDrawer;
$drawer.onclick = (e) => { if (e.target.closest("a")) closeDrawer(); };
document.addEventListener("visibilitychange", () => {
  // Retour dans l'app après >2 min : on resynchronise (le coach a pu modifier le plan).
  if (document.visibilityState === "visible" && Date.now() - S.loadedAt > 120000 && !ED) loadAll({ silent: true });
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

// À l'ouverture, toujours l'espace Sport.
if (/^#\/(n|s)\//.test(location.hash)) history.replaceState(null, "", "#/today");

render();
loadAll();
