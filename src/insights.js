import { DEFAULT_ELEMENTS, parseNumber } from "./domain.js";

// ----------------------- PASSO 1 - MODELO INICIAL E INDICADORES -----------------------

export const OFFICIAL_TEMPLATE = {
  id: "official",
  name: "Bainhar no corpo do SL - 1 lado",
  family: "Sobre-lençol",
  elements: DEFAULT_ELEMENTS,
  route: [
    { code: "2.1", frequency: 1 },
    { code: "1.1", frequency: 1 },
    { code: "3.1", frequency: 1 },
  ],
};

export function analyzeTimes(history, current) {
  const comparable = history.filter((item) =>
    item?.form?.operation?.trim().toLocaleLowerCase("pt-BR") ===
      current.form.operation?.trim().toLocaleLowerCase("pt-BR") &&
    item?.form?.family?.trim().toLocaleLowerCase("pt-BR") ===
      current.form.family?.trim().toLocaleLowerCase("pt-BR") &&
    Number.isFinite(Number(item.total)),
  );
  const average = comparable.length
    ? comparable.reduce((sum, item) => sum + Number(item.total), 0) / comparable.length
    : null;
  const sameMachine = comparable.filter(
    (item) => String(item.form.machine) === String(current.form.machine),
  );
  const machineAverage = sameMachine.length
    ? sameMachine.reduce((sum, item) => sum + Number(item.total), 0) / sameMachine.length
    : null;
  const measured = sameMachine.filter((item) => Number(item.observedTime) > 0);
  const observedAverage = measured.length
    ? measured.reduce((sum, item) => sum + Number(item.observedTime), 0) / measured.length
    : null;
  const observed = parseNumber(current.form.observedTime);
  const deviation = observed > 0 && current.calculation.total > 0
    ? ((observed - current.calculation.total) / current.calculation.total) * 100
    : null;
  return {
    comparableCount: comparable.length,
    average,
    sameMachineCount: sameMachine.length,
    machineAverage,
    measuredCount: measured.length,
    observedAverage,
    observed,
    deviation,
  };
}

// ----------------------- PASSO 2 - DIAGNÓSTICO EXPLICÁVEL DA FICHA -----------------------

export function diagnose({ errors, calculation, fastest, form, times }) {
  const blockers = errors.map((message) => ({ kind: "error", message }));
  const improvements = [];
  const successes = [];

  if (!errors.length) successes.push("Dados obrigatórios e roteiro válidos para gerar a ficha PO.");
  if (calculation.total > 0) {
    successes.push("Tempo estimado calculado com parcelas FIXO e MTM identificáveis.");
  }
  if (fastest && form.machine !== fastest.machine.code && calculation.total > fastest.total) {
    improvements.push(
      `${fastest.machine.type} ${fastest.machine.model} tem menor tempo estimado para este roteiro: ${fastest.total.toFixed(4)} min. Confirme disponibilidade e adequação antes de trocar.`,
    );
  }
  if (times.deviation !== null) {
    if (Math.abs(times.deviation) > 10) {
      improvements.push(
        `Tempo observado ${times.deviation > 0 ? "acima" : "abaixo"} do estimado em ${Math.abs(times.deviation).toFixed(1)}%. Revise medição, perímetro, frequência e máquina.`,
      );
    } else {
      successes.push("Tempo observado está dentro da faixa indicativa de 10% do estimado.");
    }
  } else {
    improvements.push("Informe o tempo observado quando houver medição real para confrontar a estimativa.");
  }
  if (times.comparableCount < 3) {
    improvements.push("Salve mais fichas da mesma família e operação para formar uma referência histórica mais útil.");
  }
  return { blockers, improvements, successes };
}
