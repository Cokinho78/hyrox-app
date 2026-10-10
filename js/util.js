// Petits utilitaires : dates, formats, DOM.

export const pad = (n) => String(n).padStart(2, "0");

export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function mondayOf(iso) {
  const d = parseISO(iso);
  const dow = (d.getDay() + 6) % 7; // lundi = 0
  d.setDate(d.getDate() - dow);
  return isoDate(d);
}

export function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const JOURS_LONG = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MOIS_LONG = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août",
  "Septembre", "Octobre", "Novembre", "Décembre"];

export function fmtDay(iso, long = false) {
  const d = parseISO(iso);
  return long
    ? `${JOURS_LONG[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`
    : `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}

export function fmtMonth(iso) {
  const d = parseISO(iso);
  return `${MOIS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtShort(iso) {
  const d = parseISO(iso);
  return `${d.getDate()}/${pad(d.getMonth() + 1)}`;
}

export function fmtDuration(sec) {
  if (sec == null || sec === "") return "";
  const s = Math.round(Number(sec));
  if (s >= 3600) return `${Math.floor(s / 3600)}h${pad(Math.floor((s % 3600) / 60))}`;
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

// "4:30" -> 270 ; "45" -> 2700 (minutes) ; "1:02:03" -> 3723
export function parseDuration(text) {
  const t = String(text ?? "").trim().replace(",", ".");
  if (!t) return null;
  const parts = t.split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 1) return Math.round(parts[0] * 60);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export function parseNum(text) {
  const t = String(text ?? "").trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function slug(text) {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").split("-").slice(0, 5).join("-") || "seance";
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

export function nl2br(s) {
  return esc(s).replace(/\n/g, "<br>");
}

export const clone = (o) => JSON.parse(JSON.stringify(o));
