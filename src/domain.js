// ----------------------- PASSO 1 - CADASTRO PADRÃO DE MÁQUINAS E ELEMENTOS MTM -----------------------

// Máquinas disponibilizadas na planilha Entradas.ods.
export const DEFAULT_MACHINES = [
  { code: "1", type: "Interlock", model: "Jack C4", rpm: 5000, rate: 0.0964 },
  { code: "2", type: "Interlock", model: "Siruba", rpm: 5000, rate: 0.0835 },
  { code: "3", type: "Reta", model: "Jack A5", rpm: 5000, rate: 0.0972 },
];

// Elementos manuais e seus tempos unitários em minutos.
export const DEFAULT_ELEMENTS = [
  { code: "1.1", description: "Costurar elemento (sem tempo)", time: 0 },
  { code: "2.1", description: "Apanhar peça e posicionar na mesa", time: 0.15 },
  {
    code: "2.2",
    description: "Apanhar, posicionar e costurar etiqueta",
    time: 0.2,
  },
  {
    code: "2.3",
    description: "Apanhar a outra extremidade da peça",
    time: 0.3,
  },
  { code: "3.1", description: "Ajeitar peça", time: 0.12 },
  {
    code: "4.1",
    description: "Dobrar duas vezes para fazer o início da bainha",
    time: 0.4,
  },
  {
    code: "5.1",
    description: "Posicionar no calcador ajustando a peça no aparelho",
    time: 0.35,
  },
  {
    code: "5.2",
    description: "Posicionar o elástico embutindo na bainha",
    time: 0.1,
  },
  { code: "6.1", description: "Cortar para separar", time: 0.25 },
];

// ----------------------- PASSO 2 - CENÁRIO OFICIAL USADO NA DEMONSTRAÇÃO -----------------------

// Mantém um exemplo válido carregado assim que o sistema é aberto.
export const OFFICIAL_SCENARIO = {
  form: {
    code: "PO-SL-001",
    revision: "00",
    operation: "Bainhar no corpo do SL - 1 lado",
    family: "Sobre-lençol",
    size: "Solteiro",
    dimensions: "1,80 x 2,50",
    stitches: "2,50",
    perimeter: "6.96",
    machine: "1",
  },
  route: [
    { code: "2.1", frequency: 1 },
    { code: "1.1", frequency: 1 },
    { code: "3.1", frequency: 1 },
  ],
};

// ----------------------- PASSO 3 - FORMATAÇÃO E CONVERSÃO DE NÚMEROS -----------------------

// Exibe os tempos com quatro casas decimais no padrão brasileiro.
export const formatMinutes = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });

// Aceita números com vírgula ou ponto e devolve um Number seguro para os cálculos.
export function parseNumber(value) {
  if (typeof value === "number") return value;
  const source = String(value ?? "")
    .trim()
    .replace(/\s/g, "");
  if (!source) return 0;
  let normalized = source;
  if (source.includes(",") && source.includes("."))
    normalized = source.replace(/\./g, "").replace(",", ".");
  else if (source.includes(",")) {
    const parts = source.split(",");
    normalized =
      parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3
        ? source.replace(/,/g, "")
        : source.replace(",", ".");
  }
  const result = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(result) ? result : 0;
}

// ----------------------- PASSO 4 - CÁLCULO DO TEMPO DA OPERAÇÃO -----------------------

export function calculateOperation(form, route, elements, machines) {
  // Localiza a máquina selecionada e calcula a parcela automática da costura.
  const machine =
    machines.find((item) => item.code === String(form.machine)) || machines[0];
  const perimeter = parseNumber(form.perimeter);
  const fixed = perimeter * (machine?.rate || 0);

  // Relaciona cada código do roteiro ao catálogo MTM e aplica sua frequência.
  const manualRows = route
    .map((entry, index) => {
      const element = elements.find((item) => item.code === entry.code);
      const frequency = Math.max(0, parseNumber(entry.frequency));
      return element
        ? { ...element, frequency, subtotal: element.time * frequency, index }
        : null;
    })
    .filter(Boolean);

  // Soma os elementos manuais e acrescenta o tempo FIXO da máquina.
  const manual = manualRows.reduce((sum, item) => sum + item.subtotal, 0);
  return { machine, fixed, manualRows, manual, total: fixed + manual };
}

// ----------------------- PASSO 5 - VALIDAÇÃO DOS DADOS DA FICHA -----------------------

export function validateOperation(form, route, elements, machines) {
  const errors = [];
  if (!String(form.code || "").trim()) errors.push("Informe o código da PO.");
  if (!String(form.operation || "").trim()) errors.push("Informe a operação.");
  if (parseNumber(form.perimeter) <= 0)
    errors.push("O perímetro deve ser maior que zero.");
  if (!machines.some((item) => item.code === String(form.machine)))
    errors.push("Selecione uma máquina válida.");
  if (!route.length) errors.push("Inclua pelo menos um elemento MTM.");
  route.forEach((entry, index) => {
    if (!elements.some((item) => item.code === entry.code))
      errors.push(
        `Elemento ${entry.code || index + 1} não encontrado no catálogo.`,
      );
    if (parseNumber(entry.frequency) <= 0)
      errors.push(
        `A frequência do elemento ${entry.code || index + 1} deve ser maior que zero.`,
      );
  });
  return [...new Set(errors)];
}

// ----------------------- PASSO 6 - COMPARAÇÃO ENTRE AS MÁQUINAS -----------------------

export function compareMachines(form, route, elements, machines) {
  // Recalcula o mesmo roteiro para cada máquina e ordena do menor para o maior tempo.
  return machines
    .map((machine) => {
      const calculation = calculateOperation(
        { ...form, machine: machine.code },
        route,
        elements,
        machines,
      );
      return {
        machine,
        fixed: calculation.fixed,
        manual: calculation.manual,
        total: calculation.total,
      };
    })
    .sort((a, b) => a.total - b.total);
}

// ----------------------- PASSO 7 - CONTROLE DE REVISÕES DA PO -----------------------

export function nextRevision(revision) {
  const value = Number.parseInt(String(revision || "0").replace(/\D/g, ""), 10);
  return String((Number.isFinite(value) ? value : 0) + 1).padStart(2, "0");
}
