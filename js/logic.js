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

// Starter catalog seeded on first run when /items is empty. Section ids
// must match the ones seedDefaults derives from DEFAULT_SECTIONS
// (sec-<name normalized>), plus sec-carnes which is created alongside.
export const DEFAULT_ITEMS = [
  // Hortifruti
  { name: "Banana", section: "sec-hortifruti", maxStock: 6, unit: "un" },
  { name: "Maçã", section: "sec-hortifruti", maxStock: 6, unit: "un" },
  { name: "Mexerica", section: "sec-hortifruti", maxStock: 6, unit: "un" },
  { name: "Pera", section: "sec-hortifruti", maxStock: 4, unit: "un" },
  { name: "Ameixa", section: "sec-hortifruti", maxStock: 6, unit: "un" },
  { name: "Limão", section: "sec-hortifruti", maxStock: 6, unit: "un" },
  { name: "Tomate", section: "sec-hortifruti", maxStock: 6, unit: "un" },
  { name: "Cebola", section: "sec-hortifruti", maxStock: 6, unit: "un" },
  { name: "Alho", section: "sec-hortifruti", maxStock: 3, unit: "un" },
  { name: "Batata", section: "sec-hortifruti", maxStock: 8, unit: "un" },
  { name: "Alface", section: "sec-hortifruti", maxStock: 1, unit: "un" },
  // Laticínios
  { name: "Leite", section: "sec-laticinios", maxStock: 6, unit: "L" },
  { name: "Ovos", section: "sec-laticinios", maxStock: 2, unit: "dz" },
  { name: "Queijo mussarela", section: "sec-laticinios", maxStock: 2, unit: "un" },
  { name: "Manteiga", section: "sec-laticinios", maxStock: 1, unit: "un" },
  { name: "Iogurte", section: "sec-laticinios", maxStock: 4, unit: "un" },
  { name: "Requeijão", section: "sec-laticinios", maxStock: 1, unit: "un" },
  // Mercearia
  { name: "Arroz", section: "sec-mercearia", maxStock: 2, unit: "un" },
  { name: "Feijão", section: "sec-mercearia", maxStock: 3, unit: "un" },
  { name: "Macarrão", section: "sec-mercearia", maxStock: 3, unit: "un" },
  { name: "Molho de tomate", section: "sec-mercearia", maxStock: 4, unit: "un" },
  { name: "Açúcar", section: "sec-mercearia", maxStock: 2, unit: "un" },
  { name: "Sal", section: "sec-mercearia", maxStock: 1, unit: "un" },
  { name: "Óleo de soja", section: "sec-mercearia", maxStock: 2, unit: "un" },
  { name: "Café", section: "sec-mercearia", maxStock: 2, unit: "un" },
  { name: "Farinha de trigo", section: "sec-mercearia", maxStock: 1, unit: "un" },
  { name: "Azeite", section: "sec-mercearia", maxStock: 1, unit: "un" },
  // Carnes
  { name: "Frango", section: "sec-carnes", maxStock: 2, unit: "kg" },
  { name: "Carne bovina", section: "sec-carnes", maxStock: 2, unit: "kg" },
  { name: "Porco", section: "sec-carnes", maxStock: 1, unit: "kg" },
  // Bebidas
  { name: "Suco", section: "sec-bebidas", maxStock: 4, unit: "un" },
  { name: "Água mineral", section: "sec-bebidas", maxStock: 6, unit: "un" },
  { name: "Refrigerante", section: "sec-bebidas", maxStock: 2, unit: "un" },
  // Padaria
  { name: "Pão francês", section: "sec-padaria", maxStock: 10, unit: "un" },
  { name: "Pão de forma", section: "sec-padaria", maxStock: 1, unit: "un" },
  // Limpeza
  { name: "Detergente", section: "sec-limpeza", maxStock: 3, unit: "un" },
  { name: "Sabão em pó", section: "sec-limpeza", maxStock: 1, unit: "un" },
  { name: "Amaciante", section: "sec-limpeza", maxStock: 1, unit: "un" },
  { name: "Água sanitária", section: "sec-limpeza", maxStock: 1, unit: "un" },
  { name: "Esponja de aço", section: "sec-limpeza", maxStock: 4, unit: "un" },
  // Higiene
  { name: "Papel higiênico", section: "sec-higiene", maxStock: 12, unit: "un" },
  { name: "Sabonete", section: "sec-higiene", maxStock: 4, unit: "un" },
  { name: "Pasta de dente", section: "sec-higiene", maxStock: 2, unit: "un" },
  { name: "Shampoo", section: "sec-higiene", maxStock: 1, unit: "un" },
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
