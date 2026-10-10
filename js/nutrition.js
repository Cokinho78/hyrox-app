// Volet latéral : repas du jour, menu de la semaine, courses, poids, sommeil, bilan.
// Mêmes principes que les séances : le coach planifie (nutrition/semaines), l'app pré-remplit,
// Corentin valide. Les calculs de macros reprennent ceux de scripts/nutrition.py.
import * as U from "./util.js";
import { picker } from "./pickers.js";

const MACROS = ["kcal", "p", "g", "l"];
const MACRO_LABEL = { kcal: "kcal", p: "Protéines", g: "Glucides", l: "Lipides" };
const SLOTS = [["petit_dej", "Petit-déj"], ["dejeuner", "Déjeuner"], ["collation", "Collation"], ["diner", "Dîner"]];
export const BALANCES = [["technogym", "Technogym (salle)"], ["travail", "Balance salle du travail"],
  ["withings", "Withings (Amarine)"], ["autre", "Autre"]];
const TRAINING_TYPES = new Set(["muscu", "hyrox", "course", "test", "course_officielle"]);
const charts = [];

const zero = () => ({ kcal: 0, p: 0, g: 0, l: 0 });
const add = (a, b, f = 1) => Object.fromEntries(MACROS.map((k) => [k, (a[k] || 0) + (b?.[k] || 0) * f]));
const fr = (n) => String(n).replace(".", ",");
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

// ---------------------------------------------------------------- chargement

export const NUT_PREFIX = "nutrition/";

export function ingestNutrition(S, data, files) {
  const get = (p) => data.get(p);
  const cat = get("nutrition/aliments.json") || { aliments: [], rayons: {} };
  const fc = get("nutrition/foodcheri.json") || { plats: [], estimation_par_defaut: zero() };
  const N = {
    rayons: cat.rayons,
    aliments: new Map(cat.aliments.map((a) => [a.id, a])),
    foodcheri: new Map(fc.plats.map((p) => [p.id, p])),
    foodcheriDefaut: fc.estimation_par_defaut,
    objectifs: get("nutrition/objectifs.json"),
    recettes: new Map(), semaines: new Map(), journal: new Map(), corps: [], sommeil: new Map(),
  };
  for (const p of files) {
    const d = get(p);
    if (!d) continue;
    if (p.startsWith("nutrition/recettes/")) N.recettes.set(d.id, d);
    else if (p.startsWith("nutrition/semaines/")) N.semaines.set(d.semaine, d);
    else if (p.startsWith("nutrition/journal/")) N.journal.set(d.date, d);
    else if (p.startsWith("nutrition/corps/")) N.corps.push(d);
    else if (p.startsWith("nutrition/sommeil/")) N.sommeil.set(d.date, d);
  }
  N.corps.sort((a, b) => a.date.localeCompare(b.date));
  S.nut = N;
}

// ---------------------------------------------------------------- calculs

function recipePortion(N, id) {
  const r = N.recettes.get(id);
  if (!r) return zero();
  if (r.par_portion) return r.par_portion;
  let t = zero();
  for (const ing of r.ingredients) t = add(t, N.aliments.get(ing.aliment), ing.g / 100);
  return Object.fromEntries(MACROS.map((k) => [k, t[k] / r.portions]));
}

function itemMacros(N, it) {
  if (it.type === "aliment") return add(zero(), N.aliments.get(it.ref), (it.g || 0) / 100);
  if (it.type === "recette") return add(zero(), recipePortion(N, it.ref), it.portions ?? 1);
  if (it.type === "foodcheri") return add(zero(), N.foodcheri.get(it.ref)?.macros || N.foodcheriDefaut);
  return Object.fromEntries(MACROS.map((k) => [k, Number(it[k]) || 0]));
}

function itemLabel(N, it) {
  if (it.type === "aliment") return N.aliments.get(it.ref)?.nom || it.ref;
  if (it.type === "recette") return N.recettes.get(it.ref)?.nom || it.ref;
  if (it.type === "foodcheri") return N.foodcheri.get(it.ref)?.nom || "Plat FoodChéri (estimation)";
  return it.label || "Saisie libre";
}

const eaten = (rep) => rep.statut === "prevu" || rep.statut === "modifie";

function dayMacros(N, journal) {
  let t = zero();
  for (const rep of journal.repas) if (eaten(rep)) for (const it of rep.items) t = add(t, itemMacros(N, it));
  return t;
}

function planDay(N, iso) {
  return N.semaines.get(U.mondayOf(iso))?.jours.find((j) => j.date === iso) || null;
}

function dayType(S, iso) {
  const pd = planDay(S.nut, iso);
  if (pd?.type) return pd.type;
  const sport = [...S.plan.sessions, ...S.logs].some((s) => s.date === iso && TRAINING_TYPES.has(s.type));
  return sport ? "entrainement" : "repos";
}

const target = (S, iso) => S.nut.objectifs?.jours?.[dayType(S, iso)] || null;

const r0 = (m) => Object.fromEntries(MACROS.map((k) => [k, Math.round(m[k] || 0)]));

// ---------------------------------------------------------------- composants

function bars(m, cible) {
  return `<div class="mbars">${MACROS.map((k) => {
    const v = Math.round(m[k] || 0);
    const c = cible?.[k];
    const pct = c ? Math.min(100, (v / c) * 100) : 0;
    const over = c && v > c * 1.1;
    return `<div class="mbar"><div class="mbar-h"><span>${MACRO_LABEL[k]}</span>
      <strong>${v}${k === "kcal" ? "" : " g"}${c ? ` <span class="meta">/ ${c}</span>` : ""}</strong></div>
      <div class="mbar-t"><div class="mbar-f ${over ? "over" : ""}" style="width:${pct}%"></div></div></div>`;
  }).join("")}</div>`;
}

const fmtM = (m) => `${Math.round(m.kcal)} kcal · P ${Math.round(m.p)} g`;

function weekNav(base, lundi, label) {
  return `<div class="weeknav">
    <a class="btn small ghost" href="#/n/${base}/${U.addDays(lundi, -7)}">←</a>
    <h2>${label} ${U.fmtShort(lundi)}</h2>
    <a class="btn small ghost" href="#/n/${base}/${U.addDays(lundi, 7)}">→</a></div>`;
}

// ---------------------------------------------------------------- repas du jour

let J = null; // journée en cours d'édition
const openLibre = new Set(); // saisies libres dépliées ("slot:item")

const draftKey = (iso) => `hyrox:nutri:${iso}`;

function buildJournal(S, iso) {
  const existing = S.nut.journal.get(iso);
  if (existing) return U.clone(existing);
  const pd = planDay(S.nut, iso);
  return {
    date: iso, source: "app",
    repas: SLOTS.map(([slot]) => ({
      slot, statut: null,
      items: U.clone(pd?.repas.find((r) => r.slot === slot)?.items || []),
    })),
    complements: Object.fromEntries((S.nut.objectifs?.complements || []).map((c) => [c.ref, false])),
    note: "",
  };
}

function openDay(S, iso) {
  openLibre.clear();
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(draftKey(iso)) || "null"); } catch { draft = null; }
  J = { iso, data: draft || buildJournal(S, iso), dirty: !!draft };
}

function saveDraft() {
  J.dirty = true;
  try { localStorage.setItem(draftKey(J.iso), JSON.stringify(J.data)); } catch { /* ignore */ }
}

function itemEditor(N, it, si, ii) {
  const at = { slot: si, item: ii };
  let ctrl = "";
  if (it.type === "recette") ctrl = `${picker("portions", it.portions ?? 1, { ...at, f: "portions" })}<span class="unit">portion</span>`;
  else if (it.type === "aliment") ctrl = `${picker("grammes", it.g, { ...at, f: "g" })}<span class="unit">g</span>`;
  else if (it.type === "foodcheri") {
    const opts = [...N.foodcheri.values()].map((p) =>
      `<option value="${p.id}" ${p.id === it.ref ? "selected" : ""}>${U.esc(p.nom)}</option>`).join("");
    ctrl = `<select class="fc" data-slot="${si}" data-item="${ii}">
      <option value="">Estimation (${N.foodcheriDefaut.kcal} kcal)</option>${opts}
      <option value="__libre">Plat non listé : saisir les macros…</option></select>`;
  } else if (!openLibre.has(`${si}:${ii}`) && it.label) {
    ctrl = `<span class="meta">P ${Math.round(it.p || 0)} · G ${Math.round(it.g || 0)} · L ${Math.round(it.l || 0)}</span>
      <button class="btn small ghost" data-act="edit-libre" data-slot="${si}" data-item="${ii}">✏️ Modifier</button>`;
  } else {
    ctrl = `<input class="lbl" data-slot="${si}" data-item="${ii}" value="${U.esc(it.label || "")}" placeholder="Nom (ex. FoodChéri curry)">
      <div class="libre">${MACROS.map((k) => `<label>${k === "kcal" ? "kcal" : k.toUpperCase()}
        ${picker(k === "kcal" ? "kcal" : "macro_g", it[k], { ...at, f: k })}</label>`).join("")}</div>`;
  }
  return `<div class="nitem">
    <div class="nitem-h"><span>${U.esc(itemLabel(N, it))}</span>
      <span class="meta">${Math.round(itemMacros(N, it).kcal)} kcal</span>
      <button class="icon small" data-act="del" data-slot="${si}" data-item="${ii}">✕</button></div>
    <div class="nitem-c">${ctrl}</div></div>`;
}

function addSelect(N, si) {
  const rec = [...N.recettes.values()].map((r) => `<option value="recette:${r.id}">${U.esc(r.nom)}</option>`).join("");
  const fc = [...N.foodcheri.values()].map((p) => `<option value="foodcheri:${p.id}">${U.esc(p.nom)}</option>`).join("");
  const al = Object.entries(N.rayons).map(([ray, lab]) => {
    const list = [...N.aliments.values()].filter((a) => a.rayon === ray);
    return list.length ? `<optgroup label="${U.esc(lab)}">${list.map((a) => `<option value="aliment:${a.id}">${U.esc(a.nom)}</option>`).join("")}</optgroup>` : "";
  }).join("");
  return `<select class="add-ex add-item" data-slot="${si}"><option value="">+ Ajouter…</option>
    <option value="libre:">Saisie libre (kcal / macros)</option>
    <option value="foodcheri:">Plat FoodChéri</option>
    ${rec ? `<optgroup label="Recettes">${rec}</optgroup>` : ""}
    ${fc ? `<optgroup label="FoodChéri déjà vus">${fc}</optgroup>` : ""}${al}</select>`;
}

function viewDay(S, iso) {
  const N = S.nut;
  if (!J || J.iso !== iso) openDay(S, iso);
  const d = J.data;
  const cible = target(S, iso);
  const tot = dayMacros(N, d);
  const pd = planDay(N, iso);
  const comps = S.nut.objectifs?.complements || [];
  return `
    <div class="weeknav">
      <a class="btn small ghost" href="#/n/jour/${U.addDays(iso, -1)}">←</a>
      <h2>${U.fmtDay(iso, true)}</h2>
      <a class="btn small ghost" href="#/n/jour/${U.addDays(iso, 1)}">→</a>
    </div>
    <p class="meta center">Jour ${dayType(S, iso) === "entrainement" ? "d'entraînement 💪" : "de repos"}
      ${pd ? "" : " · pas de menu prévu"}${J.dirty ? ' · <span class="warn">non enregistré</span>' : ""}</p>
    ${bars(tot, cible)}
    ${d.repas.map((rep, si) => {
      const label = SLOTS.find(([s]) => s === rep.slot)?.[1] || rep.slot;
      const m = rep.items.reduce((t, it) => add(t, itemMacros(N, it)), zero());
      return `<section class="block meal ${rep.statut || "todo"}">
        <div class="meal-h"><h4>${label}</h4><span class="meta">${rep.items.length ? fmtM(m) : ""}</span></div>
        ${rep.items.map((it, ii) => itemEditor(N, it, si, ii)).join("") || '<p class="meta">Rien de prévu.</p>'}
        ${addSelect(N, si)}
        <div class="chips">
          <button class="chip ${eaten(rep) ? "on" : ""}" data-act="eat" data-slot="${si}">✓ Mangé</button>
          <button class="chip ${rep.statut === "saute" ? "on" : ""}" data-act="skip" data-slot="${si}">✗ Sauté</button>
        </div>
      </section>`;
    }).join("")}
    ${comps.length ? `<section class="block"><h4>Compléments</h4><div class="chips">${comps.map((c) =>
      `<button class="chip ${d.complements?.[c.ref] ? "on" : ""}" data-act="comp" data-ref="${c.ref}">
        ${d.complements?.[c.ref] ? "✓ " : ""}${U.esc(N.aliments.get(c.ref)?.nom.split(" ")[0] || c.ref)} ${c.g} g</button>`).join("")}</div></section>` : ""}
    <section class="block form"><label>Note pour le coach<textarea data-act="note" rows="2">${U.esc(d.note || "")}</textarea></label></section>
    <div class="savebar"><button class="btn wide" data-act="save-day">Enregistrer la journée</button></div>`;
}

function slotStatus(N, iso, rep) {
  const planned = planDay(N, iso)?.repas.find((r) => r.slot === rep.slot)?.items || [];
  return JSON.stringify(planned) === JSON.stringify(rep.items) ? "prevu" : "modifie";
}

function bindDay(view, S, ctx) {
  const N = S.nut;
  const rerender = () => { const y = view.scrollTop; view.innerHTML = viewDay(S, J.iso); view.scrollTop = y; };
  const itemOf = (el) => J.data.repas[+el.dataset.slot].items[+el.dataset.item];
  const touched = (si) => {
    const rep = J.data.repas[si];
    if (eaten(rep)) rep.statut = slotStatus(N, J.iso, rep);
  };
  view.oninput = (e) => {
    const t = e.target;
    if (t.dataset.act === "note") { J.data.note = t.value; saveDraft(); return; }
    if (t.classList.contains("lbl")) { itemOf(t).label = t.value; saveDraft(); }
  };
  view.onchange = (e) => {
    const t = e.target;
    if (t.classList.contains("pick") && t.dataset.f) {
      itemOf(t)[t.dataset.f] = U.parseNum(t.value);
      touched(+t.dataset.slot);
    } else if (t.classList.contains("fc")) {
      const it = itemOf(t);
      if (t.value === "__libre") Object.assign(it, { type: "libre", ref: undefined, label: "FoodChéri", ...r0(N.foodcheriDefaut) });
      else it.ref = t.value || undefined;
      touched(+t.dataset.slot);
    } else if (t.classList.contains("add-item") && t.value) {
      const [type, ref] = t.value.split(":");
      const rep = J.data.repas[+t.dataset.slot];
      const it = type === "recette" ? { type, ref, portions: 1 }
        : type === "aliment" ? { type, ref, g: N.aliments.get(ref)?.unites?.dose || 100 }
          : type === "foodcheri" ? { type, ...(ref ? { ref } : {}) }
            : { type: "libre", label: "", ...zero() };
      rep.items.push(it);
      rep.statut = "modifie";
    } else return;
    saveDraft();
    rerender();
  };
  view.onclick = async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.tagName === "TEXTAREA") return;
    const act = b.dataset.act;
    const rep = b.dataset.slot != null ? J.data.repas[+b.dataset.slot] : null;
    if (act === "eat") rep.statut = eaten(rep) ? null : slotStatus(N, J.iso, rep);
    else if (act === "skip") rep.statut = rep.statut === "saute" ? null : "saute";
    else if (act === "del") { rep.items.splice(+b.dataset.item, 1); openLibre.clear(); touched(+b.dataset.slot); }
    else if (act === "edit-libre") { openLibre.add(`${b.dataset.slot}:${b.dataset.item}`); rerender(); return; }
    else if (act === "comp") { J.data.complements[b.dataset.ref] = !J.data.complements[b.dataset.ref]; }
    else if (act === "save-day") {
      const d = { ...J.data, macros: r0(dayMacros(N, J.data)), updated_at: new Date().toISOString() };
      d.repas = d.repas.map((r) => ({ ...r, statut: r.statut || "non_renseigne" }));
      b.disabled = true;
      b.textContent = "Enregistrement…";
      const ok = await ctx.save(`nutrition/journal/${J.iso}.json`, d, `journée: ${J.iso}`);
      if (ok) {
        N.journal.set(J.iso, d);
        localStorage.removeItem(draftKey(J.iso));
        J.dirty = false;
        J.data = U.clone(d);
      }
      rerender();
      return;
    } else return;
    saveDraft();
    rerender();
  };
}

// ---------------------------------------------------------------- semaine, recette, courses

function viewWeek(S, lundi) {
  const N = S.nut;
  const sem = N.semaines.get(lundi);
  if (!sem) {
    return `${weekNav("semaine", lundi, "Menu du")}
      <p class="empty">Pas de menu pour cette semaine.<br>Demande au coach : « prépare ma semaine ».</p>`;
  }
  const b = sem.batch;
  return `${weekNav("semaine", lundi, "Menu du")}
    <p class="meta center">${sem.statut === "valide" ? "✅ Validé" : "📝 Proposition"} ·
      <a href="#/n/courses/${lundi}">🛒 Liste de courses</a></p>
    ${b ? `<a class="card" href="#/n/recette/${encodeURIComponent(b.recette)}">
      <span class="badge t-hyrox">Batch ${b.jour_cuisine ? U.fmtDay(b.jour_cuisine) : ""}</span>
      <h3>${U.esc(N.recettes.get(b.recette)?.nom || b.recette)} ×${b.portions}</h3>
      <p class="meta">${fmtM(recipePortion(N, b.recette))} par portion · voir la recette →</p></a>` : ""}
    ${sem.jours.map((j) => {
      const m = j.macros || j.repas.reduce((t, r) => r.items.reduce((u, it) => add(u, itemMacros(N, it)), t), zero());
      const c = j.cible || target(S, j.date);
      return `<a class="card" href="#/n/jour/${j.date}">
        <div class="row"><strong>${U.fmtDay(j.date, true)}</strong>
          <span class="badge ${j.type === "entrainement" ? "t-muscu" : ""}">${j.type === "entrainement" ? "Entraînement" : "Repos"}</span>
          <span class="st meta">${Math.round(m.kcal)}${c ? ` / ${c.kcal}` : ""} kcal</span></div>
        ${j.repas.map((r) => `<p class="meta">${SLOTS.find(([s]) => s === r.slot)?.[1]} : ${r.items.map((it) => U.esc(itemLabel(N, it))).join(", ")}</p>`).join("")}
      </a>`;
    }).join("")}`;
}

function viewRecipe(S, id) {
  const N = S.nut;
  const r = N.recettes.get(id);
  if (!r) return `<p class="empty">Recette introuvable.</p>`;
  const pp = recipePortion(N, id);
  return `<a class="back" href="javascript:history.back()">← Retour</a>
    <h1>${U.esc(r.nom)}</h1>
    <p class="meta">${r.portions} portions · ${r.temps_min || "?"} min${r.airfryer ? " · airfryer" : ""}</p>
    <div class="stats">${MACROS.map((k) => `<div><span>${MACRO_LABEL[k]} / portion</span><strong>${Math.round(pp[k])}${k === "kcal" ? "" : " g"}</strong></div>`).join("")}</div>
    <section class="block"><h4>Ingrédients (crus)</h4>
      ${r.ingredients.map((i) => `<p>${U.esc(N.aliments.get(i.aliment)?.nom || i.aliment)} — <strong>${i.g} g</strong></p>`).join("")}
      ${(r.placard || []).length ? `<p class="meta">Placard : ${r.placard.map(U.esc).join(", ")}</p>` : ""}
      ${(r.options || []).length ? `<p class="meta">Options : ${r.options.map((o) => U.esc(o.label)).join(", ")}</p>` : ""}
    </section>
    <section class="block"><h4>Étapes</h4><ol class="steps">${(r.etapes || []).map((e) => `<li>${U.esc(e)}</li>`).join("")}</ol></section>
    ${r.notes ? `<div class="box"><span>Notes</span>${U.esc(r.notes)}</div>` : ""}`;
}

function viewCourses(S, lundi) {
  const N = S.nut;
  const sem = N.semaines.get(lundi);
  if (!sem?.courses?.length) {
    return `${weekNav("courses", lundi, "Courses du")}<p class="empty">Pas de liste pour cette semaine.</p>`;
  }
  let done = [];
  try { done = JSON.parse(localStorage.getItem(`hyrox:courses:${lundi}`) || "[]"); } catch { done = []; }
  const groups = new Map();
  for (const c of sem.courses) {
    if (!groups.has(c.rayon)) groups.set(c.rayon, []);
    groups.get(c.rayon).push(c);
  }
  return `${weekNav("courses", lundi, "Courses du")}
    ${[...groups.entries()].map(([ray, items]) => `<section class="block"><h4>${U.esc(N.rayons[ray] || ray)}</h4>
      ${items.map((c) => `<label class="todo-row ${done.includes(c.label) ? "done" : ""}">
        <input type="checkbox" data-course="${U.esc(c.label)}" ${done.includes(c.label) ? "checked" : ""}>
        <span>${U.esc(c.label)}</span><span class="meta">${U.esc(c.quantite)}</span></label>`).join("")}
    </section>`).join("")}
    <button class="btn ghost wide" data-act="reset-courses">Tout décocher</button>`;
}

function bindCourses(view, S, lundi, rerender) {
  const key = `hyrox:courses:${lundi}`;
  const read = () => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } };
  view.onchange = (e) => {
    const lab = e.target.dataset.course;
    if (lab == null) return;
    const s = new Set(read());
    if (e.target.checked) s.add(lab); else s.delete(lab);
    try { localStorage.setItem(key, JSON.stringify([...s])); } catch { /* ignore */ }
    e.target.closest(".todo-row").classList.toggle("done", e.target.checked);
  };
  view.onclick = (e) => {
    if (e.target.dataset.act === "reset-courses") { localStorage.removeItem(key); rerender(); }
  };
}

// ---------------------------------------------------------------- poids

let corpsForm = null;

function viewCorps(S) {
  const N = S.nut;
  const last = N.corps[N.corps.length - 1];
  corpsForm ??= { date: U.isoDate(), balance: last?.balance || "technogym", poids_kg: last?.poids_kg ?? null, gras_pct: null, muscle_kg: null, note: "" };
  const f = corpsForm;
  const recent = [...N.corps].reverse().slice(0, 12);
  return `<h1>Poids & composition</h1>
    <section class="block form">
      <div class="two"><label>Date<input type="date" data-cf="date" value="${f.date}"></label>
        <label>Balance<select data-cf="balance">${BALANCES.map(([id, lab]) => `<option value="${id}" ${id === f.balance ? "selected" : ""}>${lab}</option>`).join("")}</select></label></div>
      <div class="three">
        <label>Poids (kg)${picker("poids_kg", f.poids_kg, { cf: "poids_kg" })}</label>
        <label>Gras (%)${picker("gras_pct", f.gras_pct, { cf: "gras_pct" })}</label>
        <label>Muscle (kg)${picker("muscle_kg", f.muscle_kg, { cf: "muscle_kg" })}</label>
      </div>
      <label>Note<input data-cf="note" value="${U.esc(f.note)}" placeholder="ex. à jeun, après le foot…"></label>
      <button class="btn wide" data-act="save-corps">Enregistrer la pesée</button>
    </section>
    <section class="chartbox"><div class="chart-h"><h3>Poids</h3></div><div class="cv"><canvas id="c-poids"></canvas></div></section>
    <section class="chartbox"><div class="chart-h"><h3>% de gras (par balance)</h3></div><div class="cv"><canvas id="c-gras"></canvas></div>
      <p class="meta">Chaque balance a sa courbe : la bioimpédance n'est pas comparable d'un appareil à l'autre.</p></section>
    <h2>Dernières pesées</h2>
    ${recent.map((m) => `<div class="logrow"><span class="d">${U.fmtShort(m.date)}</span>
      <span class="t">${fr(m.poids_kg)} kg${m.gras_pct ? ` · ${fr(m.gras_pct)} %` : ""}${m.muscle_kg ? ` · ${fr(m.muscle_kg)} kg muscle` : ""}</span>
      <span class="r">${U.esc(BALANCES.find(([id]) => id === m.balance)?.[1] || m.balance)}</span></div>`).join("") || '<p class="empty">Aucune pesée.</p>'}`;
}

function drawCorps(S) {
  const N = S.nut;
  const pts = N.corps;
  charts.push(new Chart(document.getElementById("c-poids"), {
    type: "line",
    data: { labels: pts.map((m) => U.fmtShort(m.date)), datasets: [{ data: pts.map((m) => m.poids_kg), borderColor: css("--accent"), tension: 0.25 }] },
    options: chartOpts(),
  }));
  const dates = [...new Set(pts.filter((m) => m.gras_pct).map((m) => m.date))];
  const palette = [css("--accent2"), css("--accent"), "#ff9cf5", "#8fd0ff"];
  charts.push(new Chart(document.getElementById("c-gras"), {
    type: "line",
    data: {
      labels: dates.map(U.fmtShort),
      datasets: BALANCES.map(([id, lab], i) => ({
        label: lab, borderColor: palette[i], backgroundColor: palette[i], spanGaps: true, tension: 0.25,
        data: dates.map((d) => pts.find((m) => m.date === d && m.balance === id)?.gras_pct ?? null),
      })).filter((ds) => ds.data.some((v) => v != null)),
    },
    options: chartOpts({ legend: true }),
  }));
}

function bindCorps(view, S, ctx, rerender) {
  view.onchange = (e) => {
    const t = e.target;
    if (!t.dataset.cf) return;
    corpsForm[t.dataset.cf] = t.classList.contains("pick") ? U.parseNum(t.value) : t.value;
  };
  view.oninput = (e) => { if (e.target.dataset.cf === "note") corpsForm.note = e.target.value; };
  view.onclick = async (e) => {
    if (e.target.dataset.act !== "save-corps") return;
    const f = corpsForm;
    if (!f.poids_kg) return ctx.toast("Indique au moins le poids", true);
    const d = { date: f.date, balance: f.balance, poids_kg: f.poids_kg, source: "app" };
    for (const k of ["gras_pct", "muscle_kg"]) if (f[k] != null) d[k] = f[k];
    if (f.note) d.note = f.note;
    const ok = await ctx.save(`nutrition/corps/${f.date}-${f.balance}.json`, d, `pesée: ${f.date} ${f.balance}`);
    if (ok) {
      S.nut.corps = S.nut.corps.filter((m) => !(m.date === d.date && m.balance === d.balance)).concat(d)
        .sort((a, b) => a.date.localeCompare(b.date));
      corpsForm = null;
      rerender();
    }
  };
}

// ---------------------------------------------------------------- sommeil

let sleepForm = null;

function viewSleepForm(S) {
  const N = S.nut;
  sleepForm ??= { date: U.isoDate(), h: null, min: null, score: null, profond_min: null, paradoxal_min: null, eveille_min: null, coucher: "", lever: "", note: "" };
  const f = sleepForm;
  const already = N.sommeil.get(f.date);
  return `<h1>Cette nuit</h1>
    ${already ? `<div class="coach">Déjà saisie : ${Math.floor(already.duree_min / 60)}h${U.pad(already.duree_min % 60)}${already.score != null ? ` · score ${already.score}` : ""}. Enregistrer à nouveau la remplace.</div>` : ""}
    <section class="block form">
      <label>Nuit se terminant le<input type="date" data-sf="date" value="${f.date}"></label>
      <div class="two">
        <label>Durée de sommeil<div class="dur">${picker("heures", f.h, { sf: "h" })}<span>h</span>${picker("dur_sec", f.min, { sf: "min" })}</div></label>
        <label>Score${picker("score", f.score, { sf: "score" })}</label>
      </div>
      <div class="three">
        <label>Profond (min)${picker("minutes_phase", f.profond_min, { sf: "profond_min" })}</label>
        <label>Paradoxal (min)${picker("minutes_phase", f.paradoxal_min, { sf: "paradoxal_min" })}</label>
        <label>Éveillé (min)${picker("minutes_phase", f.eveille_min, { sf: "eveille_min" })}</label>
      </div>
      <div class="two"><label>Coucher<input type="time" data-sf="coucher" value="${f.coucher}"></label>
        <label>Lever<input type="time" data-sf="lever" value="${f.lever}"></label></div>
      <label>Note<input data-sf="note" value="${U.esc(f.note)}" placeholder="ex. réveillé 2 fois"></label>
      <button class="btn wide" data-act="save-sleep">Enregistrer la nuit</button>
    </section>
    <p class="meta center">Recopie les données de l'app Sommeil de l'Apple Watch.</p>`;
}

function viewSleepTrack(S) {
  const all = [...S.nut.sommeil.values()].sort((a, b) => b.date.localeCompare(a.date));
  const last7 = all.filter((s) => U.daysBetween(s.date, U.isoDate()) < 7);
  const avg = last7.length ? last7.reduce((t, s) => t + s.duree_min, 0) / last7.length : null;
  const sc = last7.filter((s) => s.score != null);
  return `<h1>Suivi du sommeil</h1>
    <div class="stats">
      <div><span>Nuits saisies (7 j)</span><strong>${last7.length}/7</strong></div>
      <div><span>Durée moyenne</span><strong>${avg != null ? `${Math.floor(avg / 60)}h${U.pad(Math.round(avg % 60))}` : "—"}</strong></div>
      <div><span>Score moyen</span><strong>${sc.length ? Math.round(sc.reduce((t, s) => t + s.score, 0) / sc.length) : "—"}</strong></div>
    </div>
    <section class="chartbox"><div class="chart-h"><h3>30 dernières nuits</h3></div><div class="cv"><canvas id="c-sleep"></canvas></div></section>
    <h2>Historique</h2>
    ${all.slice(0, 30).map((s) => `<div class="logrow"><span class="d">${U.fmtShort(s.date)}</span>
      <span class="t">${Math.floor(s.duree_min / 60)}h${U.pad(s.duree_min % 60)}${s.coucher ? ` · ${s.coucher} → ${s.lever || "?"}` : ""}${s.note ? ` · ${U.esc(s.note)}` : ""}</span>
      <span class="r">${s.score != null ? `score ${s.score}` : ""}</span></div>`).join("") || '<p class="empty">Aucune nuit saisie.</p>'}`;
}

function drawSleep(S) {
  const days = Array.from({ length: 30 }, (_, i) => U.addDays(U.isoDate(), i - 29));
  const n = days.map((d) => S.nut.sommeil.get(d));
  charts.push(new Chart(document.getElementById("c-sleep"), {
    data: {
      labels: days.map(U.fmtShort),
      datasets: [
        { type: "bar", label: "Durée (h)", data: n.map((s) => (s ? +(s.duree_min / 60).toFixed(1) : null)), backgroundColor: css("--accent2"), borderRadius: 3, yAxisID: "y" },
        { type: "line", label: "Score", data: n.map((s) => s?.score ?? null), borderColor: css("--accent"), spanGaps: true, tension: 0.25, yAxisID: "y1" },
      ],
    },
    options: chartOpts({ legend: true, y1: true }),
  }));
}

function bindSleep(view, S, ctx, rerender) {
  view.onchange = (e) => {
    const t = e.target;
    if (!t.dataset.sf) return;
    sleepForm[t.dataset.sf] = t.classList.contains("pick") ? U.parseNum(t.value) : t.value;
  };
  view.oninput = (e) => { if (e.target.dataset.sf === "note") sleepForm.note = e.target.value; };
  view.onclick = async (e) => {
    if (e.target.dataset.act !== "save-sleep") return;
    const f = sleepForm;
    if (f.h == null && f.min == null) return ctx.toast("Indique au moins la durée", true);
    const d = { date: f.date, duree_min: (f.h || 0) * 60 + (f.min || 0), source: "app" };
    for (const k of ["score", "profond_min", "paradoxal_min", "eveille_min"]) if (f[k] != null) d[k] = f[k];
    for (const k of ["coucher", "lever", "note"]) if (f[k]) d[k] = f[k];
    const ok = await ctx.save(`nutrition/sommeil/${f.date}.json`, d, `sommeil: ${f.date}`);
    if (ok) { S.nut.sommeil.set(d.date, d); sleepForm = null; location.hash = "#/s/suivi"; }
  };
}

// ---------------------------------------------------------------- bilan

function viewBilan(S) {
  const N = S.nut;
  const days = Array.from({ length: 7 }, (_, i) => U.addDays(U.isoDate(), i - 6));
  const logged = days.map((d) => N.journal.get(d)).filter(Boolean);
  const avg = (k) => (logged.length ? logged.reduce((t, j) => t + (j.macros?.[k] || 0), 0) / logged.length : null);
  const avgTarget = (k) => {
    const c = logged.map((j) => target(S, j.date)?.[k]).filter(Boolean);
    return c.length ? c.reduce((a, b) => a + b, 0) / c.length : null;
  };
  const comps = N.objectifs?.complements || [];
  return `<h1>Bilan nutrition</h1>
    <div class="stats">
      <div><span>Jours saisis (7 j)</span><strong>${logged.length}/7</strong></div>
      <div><span>Kcal moyennes</span><strong>${avg("kcal") != null ? Math.round(avg("kcal")) : "—"}</strong>${avgTarget("kcal") ? `<span>cible ${Math.round(avgTarget("kcal"))}</span>` : ""}</div>
      <div><span>Protéines moy.</span><strong>${avg("p") != null ? `${Math.round(avg("p"))} g` : "—"}</strong>${avgTarget("p") ? `<span>cible ${Math.round(avgTarget("p"))} g</span>` : ""}</div>
      ${comps.map((c) => `<div><span>${U.esc(N.aliments.get(c.ref)?.nom.split(" ")[0] || c.ref)} (7 j)</span>
        <strong>${logged.filter((j) => j.complements?.[c.ref]).length}/7</strong></div>`).join("")}
    </div>
    <section class="chartbox"><div class="chart-h"><h3>Kcal par jour vs cible (14 j)</h3></div><div class="cv"><canvas id="c-kcal"></canvas></div></section>
    <section class="chartbox"><div class="chart-h"><h3>Protéines par jour (14 j)</h3></div><div class="cv"><canvas id="c-prot"></canvas></div></section>
    <p class="meta center">Seuls les jours enregistrés dans « Repas du jour » comptent.</p>`;
}

function drawBilan(S) {
  const days = Array.from({ length: 14 }, (_, i) => U.addDays(U.isoDate(), i - 13));
  const j = days.map((d) => S.nut.journal.get(d));
  const mk = (id, k, color) => charts.push(new Chart(document.getElementById(id), {
    data: {
      labels: days.map(U.fmtShort),
      datasets: [
        { type: "bar", label: "Réalisé", data: j.map((x) => x?.macros?.[k] ?? null), backgroundColor: color, borderRadius: 3 },
        { type: "line", label: "Cible", data: days.map((d) => target(S, d)?.[k] ?? null), borderColor: css("--muted"), borderDash: [4, 4], pointRadius: 0 },
      ],
    },
    options: chartOpts({ legend: true }),
  }));
  mk("c-kcal", "kcal", css("--accent"));
  mk("c-prot", "p", css("--accent2"));
}

// ---------------------------------------------------------------- routeur du volet

function chartOpts({ legend = false, y1 = false } = {}) {
  const txt = css("--muted");
  const grid = css("--line");
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: { legend: { display: legend, labels: { color: txt, boxWidth: 12 } } },
    scales: {
      x: { ticks: { color: txt, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, grid: { color: grid } },
      y: { ticks: { color: txt }, grid: { color: grid } },
      ...(y1 ? { y1: { position: "right", min: 0, max: 100, ticks: { color: txt }, grid: { display: false } } } : {}),
    },
  };
}

export function renderNutrition(view, S, ctx, sub, arg) {
  charts.splice(0).forEach((c) => c.destroy());
  if (!S.nut) { view.innerHTML = `<p class="empty">Données nutrition non chargées.</p>`; return; }
  const rerender = () => renderNutrition(view, S, ctx, sub, arg);
  const lundi = U.mondayOf(arg || U.isoDate());
  switch (sub) {
    case "semaine": view.innerHTML = viewWeek(S, lundi); break;
    case "recette": view.innerHTML = viewRecipe(S, decodeURIComponent(arg || "")); break;
    case "courses": view.innerHTML = viewCourses(S, lundi); bindCourses(view, S, lundi, rerender); break;
    case "corps": view.innerHTML = viewCorps(S); bindCorps(view, S, ctx, rerender); if (window.Chart) drawCorps(S); break;
    case "nuit": view.innerHTML = viewSleepForm(S); bindSleep(view, S, ctx, rerender); break;
    case "suivi": view.innerHTML = viewSleepTrack(S); if (window.Chart) drawSleep(S); break;
    case "bilan": view.innerHTML = viewBilan(S); if (window.Chart) drawBilan(S); break;
    default: {
      const iso = arg || U.isoDate();
      view.innerHTML = viewDay(S, iso);
      bindDay(view, S, ctx);
    }
  }
}

export const hasUnsavedDay = () => !!J?.dirty;
