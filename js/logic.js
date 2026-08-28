// Pure helpers: no DOM, no Firebase. Level computation, accent-insensitive
// normalization and small formatters used across screens.

export const DEFAULT_THRESHOLDS = { muitoMin: 0.66, poucoMax: 0.33 };

export const DEFAULT_SECTIONS = [
  "Hortifruti",
  "Laticínios",
  "Mercearia",
  "Padaria",
  "Congelados",
  "Bebidas",
  "Limpeza",
  "Higiene",
];

// Lowercase + strip accents, so "Açúcar" matches "acucar".
export function normalize(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Level is computed, never stored. ratio = current / max.
//   ratio > muitoMin            -> muito (green)
//   poucoMax <= ratio <= muitoMin -> medio (yellow)
//   ratio < poucoMax            -> pouco (red)
export function levelOf(item, thresholds) {
  const t = thresholds || DEFAULT_THRESHOLDS;
  const max = Number(item.maxStock) || 0;
  const ratio = max > 0 ? Number(item.currentStock || 0) / max : 0;
  if (ratio > t.muitoMin) return "muito";
  if (ratio < t.poucoMax) return "pouco";
  return "medio";
}

export const LEVEL_LABEL = { muito: "Muito", medio: "Médio", pouco: "Pouco" };

export function qtyLabel(item) {
  const unit = item.unit ? ` ${item.unit}` : "";
  return `${item.currentStock} / ${item.maxStock}${unit}`;
}

// Stable sort of sections by order, then name.
export function sortSections(sections) {
  return [...sections].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "pt")
  );
}

export function sortItems(items) {
  return [...items].sort((a, b) =>
    (a.nameLower || "").localeCompare(b.nameLower || "", "pt")
  );
}

// Shopping list order inside a section: unchecked first, then checked,
// each block by insertion time.
export function sortEntries(entries) {
  const ts = (e) =>
    e.addedAt && typeof e.addedAt.toMillis === "function" ? e.addedAt.toMillis() : 0;
  return [...entries].sort(
    (a, b) => Number(a.checked) - Number(b.checked) || ts(a) - ts(b)
  );
}

export function validThresholds(muitoMin, poucoMax) {
  return (
    Number.isFinite(muitoMin) &&
    Number.isFinite(poucoMax) &&
    muitoMin > 0 &&
    muitoMin < 1 &&
    poucoMax > 0 &&
    poucoMax < 1 &&
    poucoMax < muitoMin
  );
}
