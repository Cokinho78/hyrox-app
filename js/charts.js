// Onglet Progrès : 4 graphiques Chart.js calculés à partir des logs.
import * as U from "./util.js";

const HYROX = ["ski_erg", "sled_push", "sled_pull", "burpees_broad_jump", "rameur",
  "farmers_carry", "sandbag_lunges", "wall_balls"];
const charts = [];
const sel = { exercise: null, station: "sled_pull", weeks: 16 };

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function doneSets(log) {
  if (log.status === "saute") return [];
  return (log.blocks || []).flatMap((b) => (b.items || []).flatMap((it) =>
    (it.sets || []).filter((s) => s.done !== false).map((s) => ({ ex: it.exercise, ...s }))));
}

function runMeters(s) {
  if (s.distance_m) return s.distance_m;
  if (s.duration_s && s.speed_kmh) return (s.duration_s * s.speed_kmh) / 3.6;
  return 0;
}

function weeklySeries(logs, weeks) {
  const start = U.addDays(U.mondayOf(U.isoDate()), -7 * (weeks - 1));
  const keys = Array.from({ length: weeks }, (_, i) => U.addDays(start, 7 * i));
  const acc = new Map(keys.map((k) => [k, { km: 0, n: 0, rpe: [] }]));
  for (const l of logs) {
    const w = acc.get(U.mondayOf(l.date));
    if (!w || l.status === "saute") continue;
    if (l.type !== "repos") w.n += 1;
    if (l.rpe != null) w.rpe.push(l.rpe);
    w.km += doneSets(l).filter((s) => s.ex === "course").reduce((t, s) => t + runMeters(s), 0) / 1000;
  }
  return keys.map((k) => ({ week: k, ...acc.get(k) }));
}

function weightSeries(logs, exId) {
  const pts = [];
  for (const l of [...logs].reverse()) {
    const w = doneSets(l).filter((s) => s.ex === exId && s.weight_kg).map((s) => s.weight_kg);
    if (w.length) pts.push({ date: l.date, y: Math.max(...w), approx: !!l.approx });
  }
  return pts;
}

function stationSeries(logs, exId, race) {
  const pts = [];
  for (const l of [...logs].reverse()) {
    const sets = doneSets(l).filter((s) => s.ex === exId && s.duration_s
      && (!s.distance_m || !race?.distance_m || s.distance_m === race.distance_m));
    if (sets.length) {
      pts.push({
        date: l.date, y: Math.min(...sets.map((s) => s.duration_s)),
        race: l.type === "course_officielle", title: l.title,
      });
    }
  }
  return pts;
}

function exercisesWithWeights(logs, exMap) {
  const count = new Map();
  for (const l of logs) for (const s of doneSets(l)) if (s.weight_kg) count.set(s.ex, (count.get(s.ex) || 0) + 1);
  return [...count.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1])
    .map(([id]) => ({ id, name: exMap.get(id)?.name || id }));
}

function baseOptions(extra = {}) {
  const grid = css("--line");
  const txt = css("--muted");
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { labels: { color: txt, boxWidth: 12 } }, ...extra.plugins },
    scales: {
      x: { ticks: { color: txt, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, grid: { color: grid } },
      y: { ticks: { color: txt }, grid: { color: grid }, ...extra.y },
      ...extra.scales,
    },
  };
}

export function renderProgress(root, S) {
  charts.splice(0).forEach((c) => c.destroy());
  if (!window.Chart) {
    root.innerHTML = `<p class="empty">Graphiques indisponibles hors connexion.</p>`;
    return;
  }
  const logs = S.logs;
  const exList = exercisesWithWeights(logs, S.ex);
  if (!sel.exercise || !exList.some((e) => e.id === sel.exercise)) {
    // Par défaut : le rowing horizontal (proxy du sled pull, priorité du programme).
    sel.exercise = exList.find((e) => e.id === "rowing_horizontal")?.id || exList[0]?.id;
  }

  const last30 = logs.filter((l) => U.daysBetween(l.date, U.isoDate()) <= 30 && l.status !== "saute");
  const km30 = last30.reduce((t, l) => t + doneSets(l).filter((s) => s.ex === "course")
    .reduce((a, s) => a + runMeters(s), 0), 0) / 1000;
  const rpe30 = last30.filter((l) => l.rpe != null);
  const avgRpe = rpe30.length ? (rpe30.reduce((t, l) => t + l.rpe, 0) / rpe30.length).toFixed(1) : "—";

  root.innerHTML = `
    <h1>Progrès</h1>
    <div class="stats">
      <div><span>Séances (30 j)</span><strong>${last30.filter((l) => l.type !== "repos").length}</strong></div>
      <div><span>Course (30 j)</span><strong>${km30.toFixed(1)} km</strong></div>
      <div><span>RPE moyen (30 j)</span><strong>${avgRpe}</strong></div>
    </div>
    <section class="chartbox">
      <div class="chart-h"><h3>Charge max par séance</h3>
        <select id="sel-ex">${exList.map((e) => `<option value="${e.id}" ${e.id === sel.exercise ? "selected" : ""}>${U.esc(e.name)}</option>`).join("")}</select></div>
      <div class="cv"><canvas id="c-weight"></canvas></div>
      <p class="meta">Points creux = données importées de l'Excel (approximatives).</p>
    </section>
    <section class="chartbox">
      <div class="chart-h"><h3>Temps par station</h3>
        <select id="sel-st">${HYROX.map((id) => `<option value="${id}" ${id === sel.station ? "selected" : ""}>${U.esc(S.ex.get(id)?.name || id)}</option>`).join("")}</select></div>
      <div class="cv"><canvas id="c-station"></canvas></div>
      <p class="meta">🏁 = course officielle (en duo : temps partagé, non comparable au solo).</p>
    </section>
    <section class="chartbox">
      <div class="chart-h"><h3>Volume de course / semaine</h3>
        <select id="sel-wk">${[8, 16, 26, 52].map((n) => `<option value="${n}" ${n === sel.weeks ? "selected" : ""}>${n} sem.</option>`).join("")}</select></div>
      <div class="cv"><canvas id="c-km"></canvas></div>
    </section>
    <section class="chartbox">
      <div class="chart-h"><h3>Séances & RPE moyen / semaine</h3></div>
      <div class="cv"><canvas id="c-rpe"></canvas></div>
    </section>`;

  const accent = css("--accent");
  const accent2 = css("--accent2");

  // 1. Charge max
  const wp = weightSeries(logs, sel.exercise);
  charts.push(new Chart(document.getElementById("c-weight"), {
    type: "line",
    data: {
      labels: wp.map((p) => U.fmtShort(p.date)),
      datasets: [{
        label: "kg", data: wp.map((p) => p.y), borderColor: accent, tension: 0.25,
        pointBackgroundColor: wp.map((p) => (p.approx ? "transparent" : accent)),
        pointBorderColor: accent, pointRadius: 4,
      }],
    },
    options: baseOptions({ plugins: { legend: { display: false } } }),
  }));

  // 2. Stations
  const race = S.ex.get(sel.station)?.race;
  const sp = stationSeries(logs, sel.station, race);
  charts.push(new Chart(document.getElementById("c-station"), {
    type: "line",
    data: {
      labels: sp.map((p) => U.fmtShort(p.date)),
      datasets: [{
        label: "Temps", data: sp.map((p) => p.y), borderColor: accent2, tension: 0.2,
        pointStyle: sp.map((p) => (p.race ? "triangle" : "circle")),
        pointRadius: sp.map((p) => (p.race ? 7 : 4)), pointBackgroundColor: accent2,
      }],
    },
    options: baseOptions({
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${U.fmtDuration(c.raw)}${sp[c.dataIndex].race ? " 🏁" : ""} — ${sp[c.dataIndex].title}` } },
      },
      y: { reverse: false, ticks: { color: css("--muted"), callback: (v) => U.fmtDuration(v) } },
    }),
  }));

  // 3 & 4. Hebdo
  const wk = weeklySeries(logs, sel.weeks);
  charts.push(new Chart(document.getElementById("c-km"), {
    type: "bar",
    data: {
      labels: wk.map((w) => U.fmtShort(w.week)),
      datasets: [{ label: "km", data: wk.map((w) => +w.km.toFixed(1)), backgroundColor: accent, borderRadius: 4 }],
    },
    options: baseOptions({ plugins: { legend: { display: false } } }),
  }));
  charts.push(new Chart(document.getElementById("c-rpe"), {
    data: {
      labels: wk.map((w) => U.fmtShort(w.week)),
      datasets: [
        { type: "bar", label: "Séances", data: wk.map((w) => w.n), backgroundColor: css("--surface2"), borderRadius: 4, yAxisID: "y" },
        {
          type: "line", label: "RPE moyen", yAxisID: "y1", borderColor: accent2, tension: 0.25, spanGaps: true,
          data: wk.map((w) => (w.rpe.length ? +(w.rpe.reduce((a, b) => a + b, 0) / w.rpe.length).toFixed(1) : null)),
        },
      ],
    },
    options: baseOptions({
      scales: { y1: { position: "right", min: 0, max: 10, ticks: { color: css("--muted") }, grid: { display: false } } },
    }),
  }));

  root.querySelector("#sel-ex")?.addEventListener("change", (e) => { sel.exercise = e.target.value; renderProgress(root, S); });
  root.querySelector("#sel-st").addEventListener("change", (e) => { sel.station = e.target.value; renderProgress(root, S); });
  root.querySelector("#sel-wk").addEventListener("change", (e) => { sel.weeks = +e.target.value; renderProgress(root, S); });
}
