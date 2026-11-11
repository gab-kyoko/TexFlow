// ----------------------- PASSO 1 - IMPORTAÇÃO DOS RECURSOS DO TEXFLOW -----------------------

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DEFAULT_MACHINES,
  DEFAULT_ELEMENTS,
  OFFICIAL_SCENARIO,
  calculateOperation,
  compareMachines,
  formatMinutes,
  nextRevision,
  parseNumber,
  validateOperation,
} from "./domain.js";
import { importTexFlowFile } from "./importers.js";
import { exportCsv, exportPdf, exportXlsx } from "./exporters.js";
import "./styles.css";

// ----------------------- PASSO 2 - CONFIGURAÇÃO DO HISTÓRICO E DO MODO DEMONSTRAÇÃO -----------------------

const HISTORY_KEY = "texflow:po-history:v1";
const DEMO_STEPS = [
  {
    title: "1. Dados da operação",
    text: "O cenário oficial é carregado com produto, perímetro e equipamento.",
    target: "dados-operacao",
  },
  {
    title: "2. Roteiro MTM",
    text: "Cada elemento possui frequência editável e subtotal calculado.",
    target: "roteiro-mtm",
  },
  {
    title: "3. Comparação de máquinas",
    text: "O simulador calcula o mesmo roteiro em todos os equipamentos.",
    target: "comparador-maquinas",
  },
  {
    title: "4. Ficha e exportações",
    text: "A PO pode ser conferida e exportada em CSV, XLSX ou PDF.",
    target: "ficha-po",
  },
  {
    title: "5. Memória de cálculo",
    text: "A central de ajuda explica a origem de cada valor.",
    target: "ajuda-calculos",
  },
];

// Mantém o valor atual quando o arquivo importado não informa determinado campo.
function mergeImportedForm(current, imported = {}) {
  return Object.fromEntries(
    Object.entries({ ...current, ...imported }).map(([key, value]) => [
      key,
      value === "" || value == null ? current[key] : value,
    ]),
  );
}

// ----------------------- PASSO 3 - INICIALIZAÇÃO DO COMPONENTE PRINCIPAL -----------------------

function App() {
  // Estados principais da ficha PO, do roteiro e dos catálogos técnicos.
  const [form, setForm] = useState({ ...OFFICIAL_SCENARIO.form });
  const [route, setRoute] = useState(
    OFFICIAL_SCENARIO.route.map((entry) => ({ ...entry })),
  );
  const [elements, setElements] = useState(DEFAULT_ELEMENTS);
  const [machines, setMachines] = useState(DEFAULT_MACHINES);
  const [selected, setSelected] = useState("");
  const [newFrequency, setNewFrequency] = useState(1);
  const [history, setHistory] = useState([]);
  const [notice, setNotice] = useState("Cenário oficial carregado.");
  const [demoStep, setDemoStep] = useState(null);
  const fileInputRef = useRef(null);

  // ----------------------- PASSO 4 - RECUPERAÇÃO DO HISTÓRICO LOCAL -----------------------

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"));
    } catch {
      setHistory([]);
    }
  }, []);

  // ----------------------- PASSO 5 - CÁLCULOS E VALIDAÇÕES AUTOMÁTICAS -----------------------

  // useMemo recalcula os resultados somente quando os dados relacionados mudam.
  const calculation = useMemo(
    () => calculateOperation(form, route, elements, machines),
    [form, route, elements, machines],
  );
  const errors = useMemo(
    () => validateOperation(form, route, elements, machines),
    [form, route, elements, machines],
  );
  const comparisons = useMemo(
    () => compareMachines(form, route, elements, machines),
    [form, route, elements, machines],
  );
  const fastest = comparisons[0];
  const isValid = errors.length === 0;
  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  // ----------------------- PASSO 6 - PERSISTÊNCIA E RESTAURAÇÃO DO CENÁRIO -----------------------

  const persistHistory = (items) => {
    setHistory(items);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  };

  const loadScenario = () => {
    setForm({ ...OFFICIAL_SCENARIO.form });
    setRoute(OFFICIAL_SCENARIO.route.map((entry) => ({ ...entry })));
    setNotice("Cenário oficial restaurado.");
  };

  // ----------------------- PASSO 7 - EDIÇÃO DO ROTEIRO MTM -----------------------

  const addElement = () => {
    if (!selected) return;
    setRoute((current) => [
      ...current,
      { code: selected, frequency: Math.max(1, parseNumber(newFrequency)) },
    ]);
    setSelected("");
    setNewFrequency(1);
  };

  const updateFrequency = (index, value) =>
    setRoute((current) =>
      current.map((entry, currentIndex) =>
        currentIndex === index ? { ...entry, frequency: value } : entry,
      ),
    );
  const removeElement = (index) =>
    setRoute((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  const moveElement = (index, direction) =>
    setRoute((current) => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });

  // ----------------------- PASSO 8 - HISTÓRICO E CONTROLE DE REVISÕES -----------------------

  const saveVersion = () => {
    if (!isValid) {
      setNotice("Corrija as pendências antes de salvar uma versão.");
      return;
    }
    const snapshot = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      savedAt: new Date().toISOString(),
      form: { ...form },
      route: route.map((entry) => ({ ...entry })),
      total: calculation.total,
    };
    persistHistory([snapshot, ...history].slice(0, 30));
    setNotice(`${form.code} Rev. ${form.revision} salva no histórico.`);
  };

  const loadVersion = (snapshot) => {
    setForm({ ...snapshot.form });
    setRoute(snapshot.route.map((entry) => ({ ...entry })));
    setNotice(
      `${snapshot.form.code} Rev. ${snapshot.form.revision} carregada.`,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const duplicateAsRevision = () => {
    setForm((current) => ({
      ...current,
      revision: nextRevision(current.revision),
    }));
    setNotice("Próxima revisão criada. Faça os ajustes e salve a nova versão.");
  };

  const deleteVersion = (id) =>
    persistHistory(history.filter((item) => item.id !== id));

  // ----------------------- PASSO 9 - IMPORTAÇÃO DE TXT, CSV, ODS E XLSX -----------------------

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importTexFlowFile(file);
      const scenario = imported.scenario || imported;
      if (imported.elements?.length) setElements(imported.elements);
      if (imported.machines?.length) setMachines(imported.machines);
      if (scenario?.form)
        setForm((current) => mergeImportedForm(current, scenario.form));
      if (scenario?.route?.length) setRoute(scenario.route);
      const details = [
        scenario?.form ? "operação" : null,
        imported.elements?.length
          ? `${imported.elements.length} elementos`
          : null,
        imported.machines?.length
          ? `${imported.machines.length} máquinas`
          : null,
      ]
        .filter(Boolean)
        .join(", ");
      setNotice(`${file.name} importado${details ? `: ${details}` : ""}.`);
    } catch (error) {
      setNotice(`Não foi possível importar ${file.name}: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  };

  // ----------------------- PASSO 10 - NAVEGAÇÃO DO MODO DEMONSTRAÇÃO -----------------------

  const startDemo = () => {
    loadScenario();
    setDemoStep(0);
    setNotice("Modo demonstração iniciado.");
  };
  const changeDemoStep = (next) => {
    if (next < 0) return;
    if (next >= DEMO_STEPS.length) {
      setDemoStep(null);
      setNotice("Demonstração concluída.");
      return;
    }
    setDemoStep(next);
    setTimeout(
      () =>
        document
          .getElementById(DEMO_STEPS[next].target)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      50,
    );
  };

  // ----------------------- PASSO 11 - MONTAGEM DA INTERFACE -----------------------

  return (
    <main className="app-shell">
      {/* ----------------------- PASSO 12 - CABEÇALHO E CONTROLES PRINCIPAIS ----------------------- */}
      <header className="topbar">
        <img src="/texflow-logo.png" alt="TexFlow" />
        <span>Automação de Tempos e Métodos</span>
        <a className="help-link" href="#ajuda-calculos">
          Ajuda e cálculos
        </a>
        <button className="demo-button" onClick={startDemo}>
          Modo demonstração
        </button>
        <button className="outline" onClick={loadScenario}>
          Cenário oficial
        </button>
      </header>

      {demoStep !== null && (
        <aside className="demo-guide" aria-live="polite">
          <div>
            <b>{DEMO_STEPS[demoStep].title}</b>
            <span>{DEMO_STEPS[demoStep].text}</span>
          </div>
          <div>
            <button
              onClick={() => changeDemoStep(demoStep - 1)}
              disabled={demoStep === 0}
            >
              Anterior
            </button>
            <span>
              {demoStep + 1}/{DEMO_STEPS.length}
            </span>
            <button onClick={() => changeDemoStep(demoStep + 1)}>
              {demoStep === DEMO_STEPS.length - 1 ? "Concluir" : "Próximo"}
            </button>
            <button className="demo-close" onClick={() => setDemoStep(null)}>
              ×
            </button>
          </div>
        </aside>
      )}

      {/* ----------------------- PASSO 13 - APRESENTAÇÃO E FLUXO DE TRABALHO ----------------------- */}
      <section className="hero">
        <div>
          <p className="eyebrow">AUTO-T&amp;M KARSTEN</p>
          <h1>Ficha PO, pronta em poucos passos.</h1>
          <p>
            Importe dados, monte o roteiro, compare máquinas e gere a ficha com
            cálculos rastreáveis.
          </p>
        </div>
        <div className="hero-stat">
          <strong>{formatMinutes(calculation.total)}</strong>
          <span>minutos na operação</span>
        </div>
      </section>

      <section className="command-bar">
        <div>
          <b>Fluxo de trabalho</b>
          <span>{notice}</span>
        </div>
        <input
          ref={fileInputRef}
          className="file-input"
          type="file"
          accept=".txt,.csv,.ods,.xlsx"
          onChange={handleImport}
        />
        <button onClick={() => fileInputRef.current?.click()}>
          Importar TXT, CSV, ODS ou XLSX
        </button>
        <button onClick={saveVersion}>Salvar versão</button>
        <button onClick={duplicateAsRevision}>
          Criar Rev. {nextRevision(form.revision)}
        </button>
      </section>

      {/* ----------------------- PASSO 14 - CONFERÊNCIA DOS DADOS ANTES DA EXPORTAÇÃO ----------------------- */}
      <section className={`validation-banner ${isValid ? "valid" : "invalid"}`}>
        <b>
          {isValid
            ? "Dados válidos para gerar a PO"
            : `${errors.length} pendência(s) encontrada(s)`}
        </b>
        {isValid ? (
          <span>Cálculo pronto para conferência e exportação.</span>
        ) : (
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </section>

      {/* ----------------------- PASSO 15 - DADOS DA OPERAÇÃO, ROTEIRO E FICHA PO ----------------------- */}
      <section className="workspace">
        <aside
          className={`panel form-panel ${demoStep === 0 ? "demo-focus" : ""}`}
          id="dados-operacao"
        >
          <div className="panel-title">
            <span>01</span>
            <div>
              <h2>Dados da operação</h2>
              <p>Informações do produto e equipamento.</p>
            </div>
          </div>
          <label>
            Código da PO
            <input value={form.code} onChange={set("code")} />
          </label>
          <label>
            Revisão
            <input value={form.revision} onChange={set("revision")} />
          </label>
          <label className="wide">
            Operação
            <input value={form.operation} onChange={set("operation")} />
          </label>
          <label>
            Família
            <input value={form.family} onChange={set("family")} />
          </label>
          <label>
            Tamanho
            <input value={form.size} onChange={set("size")} />
          </label>
          <label>
            Medidas (m)
            <input value={form.dimensions} onChange={set("dimensions")} />
          </label>
          <label>
            Pontos/cm
            <input value={form.stitches} onChange={set("stitches")} />
          </label>
          <label>
            Perímetro de costura (m)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.perimeter}
              onChange={set("perimeter")}
            />
          </label>
          <label>
            Máquina
            <select value={form.machine} onChange={set("machine")}>
              {machines.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} - {item.type} ({item.model})
                </option>
              ))}
            </select>
          </label>
          {calculation.machine && (
            <div className="machine-note">
              <b>
                {calculation.machine.type} · {calculation.machine.model}
              </b>
              <span>
                {calculation.machine.rpm.toLocaleString("pt-BR")} RPM ·{" "}
                {calculation.machine.rate.toLocaleString("pt-BR")} min/m
              </span>
            </div>
          )}
        </aside>

        <section
          className={`panel route-panel ${demoStep === 1 ? "demo-focus" : ""}`}
          id="roteiro-mtm"
        >
          <div className="panel-title">
            <span>02</span>
            <div>
              <h2>Roteiro de elementos</h2>
              <p>Defina sequência e frequência dos códigos MTM.</p>
            </div>
          </div>
          <div className="add-row">
            <select
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Selecione um elemento MTM</option>
              {elements.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} · {item.description}
                </option>
              ))}
            </select>
            <input
              aria-label="Frequência do novo elemento"
              type="number"
              min="1"
              step="1"
              value={newFrequency}
              onChange={(event) => setNewFrequency(event.target.value)}
            />
            <button onClick={addElement}>Adicionar</button>
          </div>
          <ol className="route-list">
            {calculation.manualRows.map((item) => (
              <li key={`${item.code}-${item.index}`}>
                <span className="code">{item.code}</span>
                <div>
                  <b>{item.description}</b>
                  <small>
                    {formatMinutes(item.time)} × {item.frequency} ={" "}
                    {formatMinutes(item.subtotal)} min
                  </small>
                </div>
                <label className="frequency-field">
                  Freq.
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={route[item.index].frequency}
                    onChange={(event) =>
                      updateFrequency(item.index, event.target.value)
                    }
                  />
                </label>
                <div className="order-buttons">
                  <button
                    aria-label="Mover para cima"
                    onClick={() => moveElement(item.index, -1)}
                    disabled={item.index === 0}
                  >
                    ↑
                  </button>
                  <button
                    aria-label="Mover para baixo"
                    onClick={() => moveElement(item.index, 1)}
                    disabled={item.index === route.length - 1}
                  >
                    ↓
                  </button>
                </div>
                <button
                  className="delete"
                  aria-label={`Remover ${item.code}`}
                  onClick={() => removeElement(item.index)}
                >
                  ×
                </button>
              </li>
            ))}
            {!calculation.manualRows.length && (
              <li className="empty">Adicione elementos MTM ao roteiro.</li>
            )}
          </ol>
          <div className="calculation">
            <span>
              Tempo FIXO{" "}
              <b>
                {parseNumber(form.perimeter).toLocaleString("pt-BR")} m ×{" "}
                {calculation.machine?.rate.toLocaleString("pt-BR")} min/m
              </b>
            </span>
            <strong>{formatMinutes(calculation.fixed)} min</strong>
            <span>
              Elementos MTM <b>{route.length} item(ns)</b>
            </span>
            <strong>{formatMinutes(calculation.manual)} min</strong>
          </div>
        </section>

        <section
          className={`panel po-panel ${demoStep === 3 ? "demo-focus" : ""}`}
          id="ficha-po"
        >
          <div className="panel-title">
            <span>03</span>
            <div>
              <h2>Ficha PO</h2>
              <p>Prévia para validação e apresentação.</p>
            </div>
          </div>
          <div className="po-document">
            <div className="po-head">
              <img src="/texflow-logo.png" alt="TexFlow" />
              <div>
                <b>{form.code || "Sem código"}</b>
                <span>Rev. {form.revision || "00"}</span>
              </div>
            </div>
            <h3>{form.operation || "Operação não informada"}</h3>
            <div className="po-meta">
              <span>
                <b>Família</b>
                {form.family || "-"}
              </span>
              <span>
                <b>Tamanho</b>
                {form.size || "-"}
              </span>
              <span>
                <b>Equipamento</b>
                {calculation.machine?.type || "-"}
              </span>
              <span>
                <b>RPM padrão</b>
                {calculation.machine?.rpm || "-"}
              </span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Cód.</th>
                  <th>Elemento</th>
                  <th>Freq.</th>
                  <th>Tempo (min)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>FIXO</td>
                  <td>Tempo de costura</td>
                  <td>1</td>
                  <td>{formatMinutes(calculation.fixed)}</td>
                </tr>
                {calculation.manualRows.map((row, index) => (
                  <tr key={`${row.code}-${index}`}>
                    <td>{row.code}</td>
                    <td>{row.description}</td>
                    <td>{row.frequency}</td>
                    <td>{formatMinutes(row.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="3">TEMPO TOTAL DA OPERAÇÃO</td>
                  <td>{formatMinutes(calculation.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="export-actions">
            <button
              disabled={!isValid}
              onClick={() => exportCsv(form, calculation)}
            >
              CSV
            </button>
            <button
              disabled={!isValid}
              onClick={() => exportXlsx(form, calculation)}
            >
              XLSX
            </button>
            <button
              disabled={!isValid}
              onClick={() => exportPdf(form, calculation)}
            >
              PDF
            </button>
            <button
              className="save-action"
              disabled={!isValid}
              onClick={saveVersion}
            >
              Salvar versão
            </button>
          </div>
        </section>
      </section>

      {/* ----------------------- PASSO 16 - SIMULAÇÃO E COMPARAÇÃO DE MÁQUINAS ----------------------- */}
      <section
        className={`feature-section simulator ${demoStep === 2 ? "demo-focus" : ""}`}
        id="comparador-maquinas"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">SIMULADOR DE CENÁRIOS</p>
            <h2>Compare o tempo entre máquinas</h2>
            <p>
              O roteiro manual permanece igual; o TexFlow recalcula o tempo FIXO
              para cada equipamento.
            </p>
          </div>
          {fastest && (
            <div className="best-machine">
              <span>Melhor tempo</span>
              <b>
                {fastest.machine.type} · {fastest.machine.model}
              </b>
              <strong>{formatMinutes(fastest.total)} min</strong>
            </div>
          )}
        </div>
        <div className="comparison-grid">
          {comparisons.map((item, index) => {
            const gain = item.total
              ? ((item.total - fastest.total) / item.total) * 100
              : 0;
            return (
              <article
                className={
                  index === 0 ? "comparison-card best" : "comparison-card"
                }
                key={item.machine.code}
              >
                <div>
                  <span>Máquina {item.machine.code}</span>
                  {index === 0 && <em>Mais rápida</em>}
                </div>
                <h3>{item.machine.type}</h3>
                <p>
                  {item.machine.model} ·{" "}
                  {item.machine.rpm.toLocaleString("pt-BR")} RPM
                </p>
                <dl>
                  <div>
                    <dt>Tempo FIXO</dt>
                    <dd>{formatMinutes(item.fixed)}</dd>
                  </div>
                  <div>
                    <dt>Tempo MTM</dt>
                    <dd>{formatMinutes(item.manual)}</dd>
                  </div>
                  <div>
                    <dt>Tempo total</dt>
                    <dd>{formatMinutes(item.total)}</dd>
                  </div>
                </dl>
                {index > 0 && (
                  <small>
                    {gain.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                    % mais lenta que a melhor opção
                  </small>
                )}
                <button
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      machine: item.machine.code,
                    }))
                  }
                >
                  Usar esta máquina
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {/* ----------------------- PASSO 17 - RASTREABILIDADE DAS REVISÕES ----------------------- */}
      <section className="feature-section history-section" id="historico">
        <div className="section-heading">
          <div>
            <p className="eyebrow">RASTREABILIDADE</p>
            <h2>Histórico e revisões</h2>
            <p>As versões ficam armazenadas somente neste navegador.</p>
          </div>
          <button className="primary" onClick={saveVersion}>
            Salvar versão atual
          </button>
        </div>
        <div className="history-list">
          {history.map((snapshot) => (
            <article key={snapshot.id}>
              <div>
                <b>{snapshot.form.code}</b>
                <span>Rev. {snapshot.form.revision}</span>
              </div>
              <p>{snapshot.form.operation}</p>
              <small>
                {new Date(snapshot.savedAt).toLocaleString("pt-BR")} ·{" "}
                {formatMinutes(snapshot.total)} min
              </small>
              <div>
                <button onClick={() => loadVersion(snapshot)}>Carregar</button>
                <button
                  className="danger"
                  onClick={() => deleteVersion(snapshot.id)}
                >
                  Excluir
                </button>
              </div>
            </article>
          ))}
          {!history.length && (
            <div className="history-empty">
              Nenhuma versão salva. Use “Salvar versão” para registrar a
              primeira.
            </div>
          )}
        </div>
      </section>

      {/* ----------------------- PASSO 18 - MEMÓRIA E AUDITORIA DOS CÁLCULOS ----------------------- */}
      <section
        className={`help-section ${demoStep === 4 ? "demo-focus" : ""}`}
        id="ajuda-calculos"
      >
        <div className="help-heading">
          <div>
            <p className="eyebrow">CENTRAL DE AJUDA</p>
            <h2>Entenda e verifique cada cálculo</h2>
            <p>
              Esta memória usa os valores preenchidos e é atualizada
              automaticamente.
            </p>
          </div>
          <span className={isValid ? "check-ok" : "check-error"}>
            {isValid ? "Cálculo consistente" : "Revise os dados"}
          </span>
        </div>
        <div className="help-grid">
          <article className="help-card">
            <span className="help-number">1</span>
            <h3>Tempo FIXO</h3>
            <p>
              Perímetro da costura multiplicado pelo tempo por metro da máquina.
            </p>
            <div className="formula">
              <code>FIXO = perímetro × tempo/metro</code>
              <strong>
                {parseNumber(form.perimeter).toLocaleString("pt-BR")} ×{" "}
                {calculation.machine?.rate.toLocaleString("pt-BR")} ={" "}
                {formatMinutes(calculation.fixed)} min
              </strong>
            </div>
          </article>
          <article className="help-card">
            <span className="help-number">2</span>
            <h3>Elementos MTM</h3>
            <p>Cada tempo unitário é multiplicado pela frequência informada.</p>
            <div className="formula">
              <code>MTM = Σ (frequência × tempo)</code>
              <strong>
                {calculation.manualRows.length
                  ? calculation.manualRows
                      .map((item) => formatMinutes(item.subtotal))
                      .join(" + ")
                  : "0,0000"}{" "}
                = {formatMinutes(calculation.manual)} min
              </strong>
            </div>
          </article>
          <article className="help-card">
            <span className="help-number">3</span>
            <h3>Tempo total</h3>
            <p>Soma do tempo FIXO com todos os subtotais MTM.</p>
            <div className="formula">
              <code>TOTAL = FIXO + MTM</code>
              <strong>
                {formatMinutes(calculation.fixed)} +{" "}
                {formatMinutes(calculation.manual)} ={" "}
                {formatMinutes(calculation.total)} min
              </strong>
            </div>
          </article>
        </div>
        <div className="audit-panel">
          <div>
            <h3>Conferência detalhada do roteiro</h3>
            <p>Compare os códigos, frequências e subtotais usados.</p>
          </div>
          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Elemento</th>
                  <th>Frequência</th>
                  <th>Tempo unitário</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {calculation.manualRows.map((item, index) => (
                  <tr key={`audit-${item.code}-${index}`}>
                    <td>{item.code}</td>
                    <td>{item.description}</td>
                    <td>{item.frequency}</td>
                    <td>{formatMinutes(item.time)}</td>
                    <td>{formatMinutes(item.subtotal)}</td>
                  </tr>
                ))}
                {!calculation.manualRows.length && (
                  <tr>
                    <td colSpan="5">Nenhum elemento MTM incluído.</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="4">Soma dos elementos MTM</td>
                  <td>{formatMinutes(calculation.manual)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <div className="help-note">
          <b>Importante:</b> no cenário oficial, pontos/cm e RPM são referências
          técnicas. A fórmula disponibilizada para o tempo FIXO utiliza o
          perímetro e o tempo por metro da máquina.
        </div>
      </section>

      <footer>
        TexFlow · Desenvolvido por Gabrielle Kyoko e Ana Luiza · Hackathon
        Auto-T&amp;M
      </footer>
    </main>
  );
}

// ----------------------- PASSO 19 - RENDERIZAÇÃO DO REACT NO NAVEGADOR -----------------------

createRoot(document.getElementById("root")).render(<App />);
