import { DEFAULT_ELEMENTS, DEFAULT_MACHINES } from "./domain.js";

// ----------------------- PASSO 1 - CHAVES E LEITURA SEGURA DO NAVEGADOR -----------------------

export const DRAFT_KEY = "texflow:po-draft:v1";
export const HISTORY_KEY = "texflow:po-history:v1";
export const TEMPLATES_KEY = "texflow:route-templates:v1";

export function readDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!draft || draft.version !== 1 || !draft.form || !Array.isArray(draft.route))
      return null;
    return {
      ...draft,
      elements: Array.isArray(draft.elements) ? draft.elements : DEFAULT_ELEMENTS,
      machines: Array.isArray(draft.machines) ? draft.machines : DEFAULT_MACHINES,
    };
  } catch {
    return null;
  }
}

export function readHistory() {
  try {
    const items = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export function readTemplates() {
  try {
    const items = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || "[]");
    return Array.isArray(items) ? items.filter((item) => item?.name && Array.isArray(item.route)) : [];
  } catch {
    return [];
  }
}

// ----------------------- PASSO 2 - ANÁLISE DAS VERSÕES SALVAS -----------------------

export function analyzeUsage(history, elements, machines) {
  const elementCounts = new Map();
  const machineCounts = new Map();

  for (const snapshot of history) {
    if (!snapshot || !Array.isArray(snapshot.route)) continue;
    const usedCodes = new Set(snapshot.route.map((entry) => String(entry.code)));
    for (const code of usedCodes) {
      elementCounts.set(code, (elementCounts.get(code) || 0) + 1);
    }
    const machineCode = String(snapshot.form?.machine || "");
    if (machineCode) {
      machineCounts.set(machineCode, (machineCounts.get(machineCode) || 0) + 1);
    }
  }

  const rank = (counts, describe) =>
    [...counts.entries()]
      .map(([code, count]) => ({ code, count, label: describe(code) }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code, "pt-BR"))
      .slice(0, 5);

  return {
    elements: rank(elementCounts, (code) =>
      elements.find((item) => String(item.code) === code)?.description ||
      history.flatMap((item) => item.elements || []).find((item) => String(item.code) === code)?.description ||
      `Elemento ${code}`,
    ),
    machines: rank(machineCounts, (code) => {
      const machine =
        machines.find((item) => String(item.code) === code) ||
        history.flatMap((item) => item.machines || []).find((item) => String(item.code) === code);
      return machine ? `${machine.type} ${machine.model}` : `Máquina ${code}`;
    }),
  };
}
