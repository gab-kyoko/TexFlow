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
import { analyzeTimes, diagnose, OFFICIAL_TEMPLATE } from "./insights.js";
import { analyzeUsage, DRAFT_KEY, HISTORY_KEY, readDraft, readHistory, readTemplates, TEMPLATES_KEY } from "./persistence.js";
import "./styles.css";

// ----------------------- PASSO 2 - CONFIGURAÇÃO DO HISTÓRICO E DO MODO DEMONSTRAÇÃO -----------------------

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

// Credenciais exclusivas para a demonstração local do protótipo.
// Em produção, esta validação deve acontecer no servidor, com senha protegida por hash.
const REVIEWER_USERNAME = "admin";
const REVIEWER_PASSWORD = "123456";

// Mantém o valor atual quando o arquivo importado não informa determinado campo.
function mergeImportedForm(current, imported = {}) {
  return Object.fromEntries(
    Object.entries({ ...current, ...imported }).map(([key, value]) => [
      key,
      value === "" || value == null ? current[key] : value,
    ]),
  );
}

function getSnapshotErrors(snapshot) {
  return validateOperation(
    snapshot.form,
    snapshot.route,
    snapshot.elements?.length ? snapshot.elements : DEFAULT_ELEMENTS,
    snapshot.machines?.length ? snapshot.machines : DEFAULT_MACHINES,
  );
}

function createReviewerDemoHistory() {
  const createSnapshot = (id, status, formPatch, dateOffset) => {
    const form = { ...OFFICIAL_SCENARIO.form, ...formPatch };
    const route = OFFICIAL_SCENARIO.route.map((item) => ({ ...item }));
    const elements = DEFAULT_ELEMENTS.map((item) => ({ ...item }));
    const machines = DEFAULT_MACHINES.map((item) => ({ ...item }));
    const calculation = calculateOperation(form, route, elements, machines);
    const savedAt = new Date(Date.now() - dateOffset).toISOString();
    return {
      id, form, route, elements, machines, total: calculation.total, status, savedAt,
      ...(status === "approved" ? { reviewedAt: savedAt, reviewedBy: "reviewer" } : {}),
    };
  };
  return [
    createSnapshot("demo-ready", "in_review", { code: "PO-SL-001", revision: "01" }, 30 * 60 * 1000),
    createSnapshot("demo-error", "in_review", { code: "PO-SL-002", revision: "03", perimeter: "", operation: "Fechar lateral da capa" }, 80 * 60 * 1000),
    createSnapshot("demo-complete", "approved", { code: "PO-SL-014", revision: "02", operation: "Costurar etiqueta lateral" }, 24 * 60 * 60 * 1000),
  ];
}

// ----------------------- PASSO 3 - PAINEL DO REVISOR -----------------------

function ReviewerPortal({ history, onOpenReview, isDemo, onStartDemo, onEndDemo }) {
  const [filter, setFilter] = useState("ready");
  const items = useMemo(
    () => history.map((snapshot) => ({ ...snapshot, errors: getSnapshotErrors(snapshot) })),
    [history],
  );
  const ready = items.filter((item) => item.status === "in_review" && item.errors.length === 0);
  const withErrors = items.filter((item) => item.status === "in_review" && item.errors.length > 0);
  const completed = items.filter((item) => item.status === "approved");
  const groups = { ready, errors: withErrors, completed };
  const labels = {
    ready: "Prontas para aprovar",
    errors: "Pendências de revisão",
    completed: "Concluídas recentemente",
  };
  const queue = groups[filter];

  return (
    <section className="reviewer-portal" id="portal-revisor">
      <div className="reviewer-portal-head">
        <div>
          <p className="eyebrow">CENTRAL DO REVISOR</p>
          <h1>Bom trabalho, admin.</h1>
          <p>Organize as fichas por prioridade e abra cada uma para conferir os cálculos.</p>
        </div>
        <div className="reviewer-head-actions">
          <button className="reviewer-demo-button" type="button" onClick={isDemo ? onEndDemo : onStartDemo}>
            {isDemo ? "Sair da demonstração" : "Demonstrar portal"}
          </button>
          <span className="reviewer-online"><i /> {isDemo ? "Demonstração ativa" : "Modo Revisor ativo"}</span>
        </div>
      </div>

      {isDemo && <p className="reviewer-demo-note">Dados de exemplo ativos: aprove uma ficha, abra uma pendência ou use “Editar ficha” para demonstrar o fluxo.</p>}

      <div className="reviewer-metrics" aria-label="Resumo das revisões">
        <button className={filter === "ready" ? "selected" : ""} type="button" onClick={() => setFilter("ready")}>
          <strong>{ready.length}</strong><span>prontas para aprovar</span>
        </button>
        <button className={filter === "errors" ? "selected warning" : "warning"} type="button" onClick={() => setFilter("errors")}>
          <strong>{withErrors.length}</strong><span>com pendências</span>
        </button>
        <button className={filter === "completed" ? "selected complete" : "complete"} type="button" onClick={() => setFilter("completed")}>
          <strong>{completed.length}</strong><span>concluídas</span>
        </button>
      </div>

      <div className="reviewer-queue">
        <div className="reviewer-queue-title">
          <div><span>FILA DE TRABALHO</span><h2>{labels[filter]}</h2></div>
          <small>{queue.length === 1 ? "1 ficha" : `${queue.length} fichas`}</small>
        </div>
        {queue.length ? (
          <div className="reviewer-cards">
            {queue.map((item) => (
              <article className={item.errors.length ? "has-errors" : ""} key={item.id}>
                <div className="reviewer-card-code"><b>{item.form.code}</b><span>Rev. {item.form.revision}</span></div>
                <h3>{item.form.operation || "Operação não informada"}</h3>
                <p>{item.form.family || "Sem família"} · {formatMinutes(item.total)} min</p>
                {filter === "errors" ? (
                  <small className="error-count">{item.errors.length} {item.errors.length === 1 ? "pendência encontrada" : "pendências encontradas"}</small>
                ) : filter === "completed" ? (
                  <small className="completed-at">Aprovada em {new Date(item.reviewedAt || item.savedAt).toLocaleDateString("pt-BR")}</small>
                ) : (
                  <small className="ready-label">Cálculos consistentes</small>
                )}
                <button type="button" onClick={() => onOpenReview(item.id)}>{filter === "completed" ? "Ver ficha" : "Abrir revisão"}</button>
              </article>
            ))}
          </div>
        ) : (
          <div className="reviewer-empty">
            {filter === "errors" ? "Nenhuma pendência de revisão no momento." : filter === "completed" ? "Ainda não há fichas aprovadas." : "Nenhuma ficha pronta para aprovação. As fichas enviadas pelo Analista aparecerão aqui."}
          </div>
        )}
      </div>
    </section>
  );
}

// ----------------------- PASSO 4 - ACESSO AO MODO REVISOR -----------------------

function ReviewerLogin({ onClose, onAuthenticate }) {
  const userRef = useRef(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    userRef.current?.focus();
  }, []);

  const submit = (event) => {
    event.preventDefault();
    if (username.trim() !== REVIEWER_USERNAME || password !== REVIEWER_PASSWORD) {
      setError("Usuário ou senha inválidos.");
      return;
    }
    onAuthenticate();
  };

  return (
    <div className="login-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="login-dialog" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <button className="login-close" type="button" onClick={onClose} aria-label="Fechar login">×</button>
        <img src="/texflow-logo.png" alt="TexFlow" />
        <p className="eyebrow">ACESSO RESTRITO</p>
        <h2 id="login-title">Entrar no modo Revisor</h2>
        <p>A aprovação de fichas PO requer identificação do revisor.</p>
        <form onSubmit={submit}>
          <label>
            Usuário
            <input
              ref={userRef}
              autoComplete="username"
              value={username}
              onChange={(event) => { setUsername(event.target.value); setError(""); }}
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => { setPassword(event.target.value); setError(""); }}
            />
          </label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="primary" type="submit">Entrar como Revisor</button>
        </form>
        <small>Ambiente demonstrativo · credenciais válidas somente neste protótipo.</small>
      </section>
    </div>
  );
}

// ----------------------- PASSO 5 - FICHA SALVA PARA CONFERÊNCIA DO REVISOR -----------------------

function ReviewSheet({ snapshot, role, onClose, onStatusChange, onEdit }) {
  const closeRef = useRef(null);
  const snapshotElements = snapshot.elements?.length ? snapshot.elements : DEFAULT_ELEMENTS;
  const snapshotMachines = snapshot.machines?.length ? snapshot.machines : DEFAULT_MACHINES;
  const calculation = calculateOperation(
    snapshot.form,
    snapshot.route,
    snapshotElements,
    snapshotMachines,
  );
  const errors = validateOperation(snapshot.form, snapshot.route, snapshotElements, snapshotMachines);
  const observed = parseNumber(snapshot.form.observedTime || snapshot.observedTime);

  useEffect(() => {
    closeRef.current?.focus();
    const onEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose]);

  return (
    <div className="review-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-title">
        <div className="review-toolbar">
          <div>
            <p className="eyebrow">VERSÃO SALVA PARA CONFERÊNCIA</p>
            <h2 id="review-title">Ficha PO {snapshot.form.code} · Rev. {snapshot.form.revision}</h2>
            <small>Salva em {new Date(snapshot.savedAt).toLocaleString("pt-BR")}. Esta prévia não altera a ficha em edição.</small>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar ficha PO">Fechar</button>
        </div>
        <div className="review-content">
          <div className="review-meta">
            <span><b>Operação</b>{snapshot.form.operation || "-"}</span>
            <span><b>Família</b>{snapshot.form.family || "-"}</span>
            <span><b>Tamanho</b>{snapshot.form.size || "-"}</span>
            <span><b>Medidas</b>{snapshot.form.dimensions || "-"}</span>
            <span><b>Perímetro</b>{snapshot.form.perimeter || "-"} m</span>
            <span><b>Máquina</b>{calculation.machine ? `${calculation.machine.type} ${calculation.machine.model}` : "-"}</span>
          </div>
          <div className="review-table-wrap">
            <table className="review-table">
              <thead><tr><th>Cód.</th><th>Elemento / memória de cálculo</th><th>Frequência</th><th>Subtotal (min)</th></tr></thead>
              <tbody>
                <tr>
                  <td>FIXO</td>
                  <td>{snapshot.form.perimeter || 0} m × {calculation.machine?.rate || 0} min/m</td>
                  <td>1</td>
                  <td>{formatMinutes(calculation.fixed)}</td>
                </tr>
                {calculation.manualRows.map((row, index) => (
                  <tr key={`${row.code}-${index}`}>
                    <td>{row.code}</td>
                    <td>{row.description}<small>{formatMinutes(row.time)} min × {row.frequency}</small></td>
                    <td>{row.frequency}</td>
                    <td>{formatMinutes(row.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan="3">TEMPO TOTAL ESTIMADO</td><td>{formatMinutes(calculation.total)}</td></tr></tfoot>
            </table>
          </div>
          <div className="review-result">
            <span>Tempo observado: <b>{observed > 0 ? `${formatMinutes(observed)} min` : "não informado"}</b></span>
            <span>Diferença: <b>{observed > 0 && calculation.total > 0 ? `${(((observed - calculation.total) / calculation.total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "sem medição"}</b></span>
          </div>
          {errors.length > 0 && <div className="review-errors"><b>Pendências:</b> {errors.join(" ")}</div>}
        </div>
        <div className="review-actions">
          <span className={`review-badge ${snapshot.status || "draft"}`}>
            {snapshot.status === "approved" ? "Aprovada" : snapshot.status === "in_review" ? "Em conferência" : "Rascunho salvo"}
          </span>
          {(!snapshot.status || snapshot.status === "draft") && (
            <button type="button" onClick={() => onStatusChange(snapshot, "in_review")}>Enviar para conferência</button>
          )}
          {snapshot.status === "in_review" && role === "reviewer" && (
            <div className="reviewer-sheet-actions">
              <button type="button" onClick={() => onEdit(snapshot)}>Editar ficha</button>
              <button className="primary" type="button" disabled={errors.length > 0} onClick={() => onStatusChange(snapshot, "approved")}>Aprovar esta versão</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ----------------------- PASSO 4 - INICIALIZAÇÃO DO COMPONENTE PRINCIPAL -----------------------

function App() {
  // Estados principais da ficha PO, do roteiro e dos catálogos técnicos.
  const [recoveredDraft] = useState(readDraft);
  const [form, setForm] = useState(() => recoveredDraft?.form || { ...OFFICIAL_SCENARIO.form });
  const [route, setRoute] = useState(
    () => recoveredDraft?.route || OFFICIAL_SCENARIO.route.map((entry) => ({ ...entry })),
  );
  const [elements, setElements] = useState(() => recoveredDraft?.elements || DEFAULT_ELEMENTS);
  const [machines, setMachines] = useState(() => recoveredDraft?.machines || DEFAULT_MACHINES);
  const [selected, setSelected] = useState("");
  const [newFrequency, setNewFrequency] = useState(1);
  const [history, setHistory] = useState(readHistory);
  const [templates, setTemplates] = useState(readTemplates);
  const [demoRole, setDemoRole] = useState(() => {
    try {
      return sessionStorage.getItem("texflow-reviewer-session") === "active" ? "reviewer" : "analyst";
    } catch {
      return "analyst";
    }
  });
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [reviewId, setReviewId] = useState(null);
  const [reviewerDemoHistory, setReviewerDemoHistory] = useState(null);
  const [reviewerEditOpen, setReviewerEditOpen] = useState(false);
  const [notice, setNotice] = useState(
    recoveredDraft ? "Rascunho recuperado deste navegador." : "Cenário oficial carregado.",
  );
  const [draftSavedAt, setDraftSavedAt] = useState(recoveredDraft?.savedAt || null);
  const [draftError, setDraftError] = useState(false);
  const [demoStep, setDemoStep] = useState(null);
  const fileInputRef = useRef(null);
  const draftDataRef = useRef({ form, route, elements, machines });
  const lastDraftRef = useRef(recoveredDraft ? JSON.stringify({
    form: recoveredDraft.form,
    route: recoveredDraft.route,
    elements: recoveredDraft.elements,
    machines: recoveredDraft.machines,
  }) : null);

  // ----------------------- PASSO 4 - SALVAMENTO AUTOMÁTICO DO RASCUNHO -----------------------

  draftDataRef.current = { form, route, elements, machines };
  useEffect(() => {
    const saveDraft = () => {
      const data = draftDataRef.current;
      const signature = JSON.stringify(data);
      if (signature === lastDraftRef.current) return;
      const savedAt = new Date().toISOString();
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, savedAt, ...data }));
        lastDraftRef.current = signature;
        setDraftSavedAt(savedAt);
        setDraftError(false);
      } catch {
        setDraftError(true);
      }
    };
    const timer = window.setInterval(saveDraft, 20_000);
    const saveWhenLeaving = () => saveDraft();
    window.addEventListener("pagehide", saveWhenLeaving);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", saveWhenLeaving);
    };
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
  const usage = useMemo(
    () => analyzeUsage(history, elements, machines),
    [history, elements, machines],
  );
  const fastest = comparisons[0];
  const times = useMemo(
    () => analyzeTimes(history, { form, calculation }),
    [history, form, calculation],
  );
  const diagnostic = useMemo(
    () => diagnose({ errors, calculation, fastest, form, times }),
    [errors, calculation, fastest, form, times],
  );
  const isValid = errors.length === 0;
  const activeReviewHistory = reviewerDemoHistory || history;
  const reviewSnapshot = activeReviewHistory.find((item) => item.id === reviewId);
  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  // ----------------------- PASSO 6 - PERSISTÊNCIA E RESTAURAÇÃO DO CENÁRIO -----------------------

  const persistHistory = (items) => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
      setHistory(items);
      return true;
    } catch {
      setNotice("Não foi possível armazenar o histórico neste navegador.");
      return false;
    }
  };

  const loadScenario = () => {
    setForm({ ...OFFICIAL_SCENARIO.form });
    setRoute(OFFICIAL_SCENARIO.route.map((entry) => ({ ...entry })));
    setNotice("Cenário oficial restaurado.");
  };

  const saveTemplate = () => {
    if (!route.length || route.some((entry) => !elements.some((item) => item.code === entry.code))) {
      setNotice("Monte um roteiro com elementos válidos antes de criar um modelo.");
      return;
    }
    const name = String(form.operation || "").trim();
    if (!name) {
      setNotice("Informe a operação para nomear o modelo.");
      return;
    }
    const item = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      name,
      family: form.family,
      route: route.map((entry) => ({ ...entry })),
      elements: elements.map((element) => ({ ...element })),
    };
    try {
      const next = [item, ...templates].slice(0, 20);
      localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
      setTemplates(next);
      setNotice(`Modelo “${name}” salvo neste navegador.`);
    } catch {
      setNotice("Não foi possível salvar o modelo neste navegador.");
    }
  };

  const applyTemplate = (id) => {
    const template = [OFFICIAL_TEMPLATE, ...templates].find((item) => item.id === id);
    if (!template) return;
    if (template.elements?.length) setElements(template.elements);
    setRoute(template.route.map((entry) => ({ ...entry })));
    setForm((current) => ({ ...current, operation: template.name, family: template.family, observedTime: "" }));
    setNotice(`Modelo “${template.name}” aplicado. Confira medidas e máquina.`);
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
      elements: elements.map((item) => ({ ...item })),
      machines: machines.map((item) => ({ ...item })),
      total: calculation.total,
      status: "draft",
      createdBy: demoRole,
      observedTime: parseNumber(form.observedTime) > 0 ? parseNumber(form.observedTime) : null,
    };
    if (persistHistory([snapshot, ...history].slice(0, 30))) {
      setNotice(`${form.code} Rev. ${form.revision} salva no histórico.`);
    }
  };

  const loadVersion = (snapshot) => {
    setForm({ ...snapshot.form });
    setRoute(snapshot.route.map((entry) => ({ ...entry })));
    if (snapshot.elements?.length) setElements(snapshot.elements);
    if (snapshot.machines?.length) setMachines(snapshot.machines);
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

  const deleteVersion = (id) => {
    if (persistHistory(history.filter((item) => item.id !== id))) {
      if (reviewId === id) setReviewId(null);
      setNotice("Versão excluída do histórico. Análise de uso atualizada.");
    }
  };

  const changeReviewStatus = (snapshot, status) => {
    if (status === "approved" && demoRole !== "reviewer") {
      setNotice("Troque para o papel Revisor para aprovar uma ficha.");
      return;
    }
    if (status === "approved") {
      const snapshotErrors = validateOperation(
        snapshot.form,
        snapshot.route,
        snapshot.elements?.length ? snapshot.elements : DEFAULT_ELEMENTS,
        snapshot.machines?.length ? snapshot.machines : DEFAULT_MACHINES,
      );
      if (snapshotErrors.length) {
        setNotice("Esta versão tem pendências e não pode ser aprovada.");
        return;
      }
    }
    const timestamp = new Date().toISOString();
    const next = activeReviewHistory.map((item) => {
      if (item.id !== snapshot.id) return item;
      return status === "approved"
        ? { ...item, status, reviewedAt: timestamp, reviewedBy: demoRole }
        : { ...item, status, submittedAt: timestamp, submittedBy: demoRole };
    });
    if (reviewerDemoHistory) {
      setReviewerDemoHistory(next);
      setNotice(`${snapshot.form.code} Rev. ${snapshot.form.revision}: ${status === "approved" ? "aprovada na demonstração" : "enviada para conferência"}.`);
    } else if (persistHistory(next)) {
      setNotice(`${snapshot.form.code} Rev. ${snapshot.form.revision}: ${status === "approved" ? "aprovada" : "enviada para conferência"}.`);
    }
  };

  const startReviewerDemo = () => {
    setReviewerDemoHistory(createReviewerDemoHistory());
    setReviewId(null);
    setNotice("Demonstração do portal do Revisor iniciada.");
  };

  const endReviewerDemo = () => {
    setReviewerDemoHistory(null);
    setReviewId(null);
    setNotice("Demonstração do portal encerrada. Seus dados não foram alterados.");
  };

  const editReviewSnapshot = (snapshot) => {
    loadVersion(snapshot);
    setReviewId(null);
    setReviewerEditOpen(true);
    setNotice(`${snapshot.form.code} Rev. ${snapshot.form.revision} aberta na aba de edição do Revisor.`);
    setTimeout(() => document.getElementById("editor-revisor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const authenticateReviewer = () => {
    try {
      sessionStorage.setItem("texflow-reviewer-session", "active");
    } catch {
      // A sessão ainda funciona nesta página se o navegador bloquear o armazenamento.
    }
    setDemoRole("reviewer");
    setIsLoginOpen(false);
    setNotice("Modo Revisor ativado. Agora você pode aprovar fichas em conferência.");
  };

  const leaveReviewerMode = () => {
    try {
      sessionStorage.removeItem("texflow-reviewer-session");
    } catch {
      // Sem ação adicional necessária.
    }
    setDemoRole("analyst");
    setNotice("Você saiu do modo Revisor.");
  };

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
    <main className={demoRole === "reviewer" ? `app-shell reviewer-mode${reviewerEditOpen ? " reviewer-editing" : ""}` : "app-shell"}>
      {/* ----------------------- PASSO 12 - CABEÇALHO E CONTROLES PRINCIPAIS ----------------------- */}
      <header className="topbar">
        <img src="/texflow-logo.png" alt="TexFlow" />
        <span>Automação de Tempos e Métodos</span>
        {demoRole === "reviewer" ? (
          <button className="reviewer-access active" type="button" onClick={leaveReviewerMode}>
            Revisor: admin · Sair
          </button>
        ) : (
          <button className="reviewer-access" type="button" onClick={() => setIsLoginOpen(true)}>
            Acessar modo Revisor
          </button>
        )}
        {demoRole !== "reviewer" && <>
          <a className="help-link" href="#ajuda-calculos">
            Ajuda e cálculos
          </a>
          <button className="demo-button" onClick={startDemo}>
            Modo demonstração
          </button>
          <button className="outline" onClick={loadScenario}>
            Cenário oficial
          </button>
        </>}
      </header>

      {demoRole !== "reviewer" && demoStep !== null && (
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

      {demoRole === "reviewer" && (
        <ReviewerPortal
          history={activeReviewHistory}
          onOpenReview={setReviewId}
          isDemo={Boolean(reviewerDemoHistory)}
          onStartDemo={startReviewerDemo}
          onEndDemo={endReviewerDemo}
        />
      )}

      {(demoRole !== "reviewer" || reviewerEditOpen) && <>
      {demoRole === "reviewer" && reviewerEditOpen && (
        <section className="reviewer-edit-tab" id="editor-revisor">
          <div>
            <p className="eyebrow">EDIÇÃO DO REVISOR</p>
            <h2>Atualize a ficha antes de aprovar</h2>
            <p>Os campos abaixo foram carregados da ficha selecionada.</p>
          </div>
          <button type="button" onClick={() => setReviewerEditOpen(false)}>Voltar para a central</button>
        </section>
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
          <small className={draftError ? "draft-status error" : "draft-status"} role="status">
            {draftError
              ? "Não foi possível salvar o rascunho neste navegador."
              : draftSavedAt
                ? `Rascunho salvo automaticamente às ${new Date(draftSavedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}. Novas alterações são salvas a cada 20 segundos.`
                : "Rascunho salvo automaticamente a cada 20 segundos."}
          </small>
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

      <section className="feature-section template-section" id="modelos-roteiro">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PADRONIZAÇÃO</p>
            <h2>Modelos de roteiro</h2>
            <p>Reaproveite uma sequência MTM e depois confira os parâmetros da operação atual.</p>
          </div>
        </div>
        <div className="template-actions">
          <label>
            Modelo disponível
            <select defaultValue="" onChange={(event) => { applyTemplate(event.target.value); event.target.value = ""; }}>
              <option value="" disabled>Selecione um modelo</option>
              {[OFFICIAL_TEMPLATE, ...templates].map((item) => (
                <option key={item.id} value={item.id}>{item.family} · {item.name}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={saveTemplate}>Salvar roteiro atual como modelo</button>
        </div>
      </section>

      {/* ----------------------- PASSO 15 - DADOS DA OPERAÇÃO, ROTEIRO E FICHA PO ----------------------- */}
      <section className="workspace" id="workspace-editor">
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
          <label>
            Tempo observado (min), se houver
            <input
              type="number"
              min="0"
              step="0.0001"
              value={form.observedTime || ""}
              onChange={set("observedTime")}
              placeholder="Ex.: 0,9500"
            />
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
            <p>As versões ficam neste navegador. Aprovações exigem acesso ao modo Revisor neste protótipo.</p>
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
              <span className={`review-badge ${snapshot.status || "draft"}`}>
                {snapshot.status === "approved"
                  ? "Aprovada"
                  : snapshot.status === "in_review"
                    ? "Em conferência"
                    : "Rascunho salvo"}
              </span>
              <small>
                {new Date(snapshot.savedAt).toLocaleString("pt-BR")} ·{" "}
                {formatMinutes(snapshot.total)} min
              </small>
              {snapshot.reviewedAt && (
                <small>Atualizada por {snapshot.reviewedBy === "reviewer" ? "Revisor" : "Analista"} em {new Date(snapshot.reviewedAt).toLocaleString("pt-BR")}</small>
              )}
              <div>
                <button onClick={() => setReviewId(snapshot.id)}>Ver ficha PO</button>
                <button onClick={() => loadVersion(snapshot)}>Carregar para editar</button>
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

      {/* ----------------------- PASSO 18 - ANÁLISE DOS ITENS MAIS USADOS ----------------------- */}
      <section className="feature-section usage-section" id="analise-uso">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ANÁLISE DE USO</p>
            <h2>Mais usados nas fichas PO</h2>
            <p>Contagem das {history.length} versões salvas neste navegador. Cada item conta uma vez por versão.</p>
          </div>
        </div>
        {history.length ? (
          <div className="usage-grid">
            <div>
              <h3>Elementos MTM</h3>
              <ol>
                {usage.elements.map((item) => (
                  <li key={item.code}>
                    <span><b>{item.code}</b> {item.label}</span>
                    <strong>{item.count} {item.count === 1 ? "ficha" : "fichas"}</strong>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h3>Máquinas selecionadas</h3>
              <ol>
                {usage.machines.map((item) => (
                  <li key={item.code}>
                    <span><b>{item.code}</b> {item.label}</span>
                    <strong>{item.count} {item.count === 1 ? "ficha" : "fichas"}</strong>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : (
          <p className="usage-empty">Salve uma versão para começar a análise.</p>
        )}
      </section>

      <section className="feature-section decision-section" id="diagnostico">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CONFERÊNCIA DA FICHA</p>
            <h2>Diagnóstico e próximos ajustes</h2>
            <p>Regras de validação e comparações indicativas calculadas com os dados disponíveis.</p>
          </div>
        </div>
        <div className="decision-summary">
          <strong className={diagnostic.blockers.length ? "diagnostic-error" : "diagnostic-success"}>
            {diagnostic.blockers.length ? "Ficha com pendências" : "Ficha pronta para conferência"}
          </strong>
          <span>FIXO {formatMinutes(calculation.fixed)} min</span>
          <span>MTM {formatMinutes(calculation.manual)} min</span>
          <span>Total {formatMinutes(calculation.total)} min</span>
        </div>
        <div className="decision-grid">
          <article>
            <h3>O que deu certo</h3>
            {diagnostic.successes.length
              ? <ul>{diagnostic.successes.map((item) => <li key={item}>{item}</li>)}</ul>
              : <p>Complete os dados para iniciar a conferência.</p>}
          </article>
          <article>
            <h3>O que corrigir</h3>
            {diagnostic.blockers.length
              ? <ul>{diagnostic.blockers.map((item) => <li key={item.message}>{item.message}</li>)}</ul>
              : <p>Nenhuma pendência de validação.</p>}
          </article>
          <article>
            <h3>O que pode melhorar</h3>
            {diagnostic.improvements.length
              ? <ul>{diagnostic.improvements.map((item) => <li key={item}>{item}</li>)}</ul>
              : <p>Nenhuma sugestão adicional com os dados atuais.</p>}
          </article>
        </div>
        <div className="times-comparison">
          <span>Tempo observado: {times.observed > 0 ? `${formatMinutes(times.observed)} min` : "não informado"}</span>
          <span>Diferença: {times.deviation === null ? "sem medição" : `${times.deviation.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</span>
          <span>Histórico da mesma família e operação: {times.comparableCount} {times.comparableCount === 1 ? "versão" : "versões"}{times.average !== null ? ` · média estimada ${formatMinutes(times.average)} min` : ""}</span>
          <span>Na máquina selecionada: {times.sameMachineCount} {times.sameMachineCount === 1 ? "versão" : "versões"}{times.machineAverage !== null ? ` · média estimada ${formatMinutes(times.machineAverage)} min` : ""}</span>
          <span>Medições reais na mesma máquina: {times.measuredCount}{times.observedAverage !== null ? ` · média observada ${formatMinutes(times.observedAverage)} min` : ""}</span>
        </div>
        <p className="decision-note">A faixa indicativa de 10% não é um limite oficial da Karsten. A aprovação técnica continua a cargo da equipe responsável.</p>
      </section>

      {/* ----------------------- PASSO 19 - MEMÓRIA E AUDITORIA DOS CÁLCULOS ----------------------- */}
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
      </>}

      {reviewSnapshot && (
        <ReviewSheet
          snapshot={reviewSnapshot}
          role={demoRole}
          onClose={() => setReviewId(null)}
          onStatusChange={changeReviewStatus}
          onEdit={editReviewSnapshot}
        />
      )}

      {isLoginOpen && (
        <ReviewerLogin
          onClose={() => setIsLoginOpen(false)}
          onAuthenticate={authenticateReviewer}
        />
      )}
    </main>
  );
}

// ----------------------- PASSO 19 - RENDERIZAÇÃO DO REACT NO NAVEGADOR -----------------------

createRoot(document.getElementById("root")).render(<App />);
