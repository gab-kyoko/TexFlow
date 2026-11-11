// ----------------------- PASSO 1 - IMPORTAÇÕES E NORMALIZAÇÃO DOS DADOS -----------------------

import { unzipSync, strFromU8 } from "fflate";
import { parseNumber } from "./domain.js";

// Remove espaços e diferenças de acentuação para reconhecer títulos escritos de formas variadas.
const normalize = (value) => String(value ?? "").trim();
const cleanLabel = (value) =>
  normalize(value)
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9/]+/g, " ")
    .trim();

// ----------------------- PASSO 2 - CONVERSÃO DE CAMPOS EM UM CENÁRIO TEXFLOW -----------------------

function scenarioFromKeyValues(entries) {
  const map = new Map(
    entries.map(([key, value]) => [cleanLabel(key), normalize(value)]),
  );
  const find = (...labels) => {
    for (const label of labels) {
      const exact = map.get(cleanLabel(label));
      if (exact !== undefined) return exact;
      const match = [...map.entries()].find(([key]) =>
        key.includes(cleanLabel(label)),
      );
      if (match) return match[1];
    }
    return "";
  };
  const routeValue = find("elementos", "roteiro de operações", "roteiro");
  return {
    form: {
      code: find("título", "titulo", "código po", "codigo po"),
      revision:
        find("rev", "revisão", "revisao").replace(/[^0-9]/g, "") || "00",
      operation: find("operação", "operacao"),
      family: find(
        "agrupamento família",
        "agrupamento familia",
        "família",
        "familia",
      ),
      size: find("tamanho"),
      dimensions: find("medidas da peça", "medidas da peca", "medidas"),
      stitches: find("pontos/cm", "pontos cm"),
      perimeter: String(
        parseNumber(
          find(
            "perímetro costura",
            "perimetro costura",
            "perímetro",
            "perimetro",
          ),
        ) || "",
      ),
      machine: find(
        "cód. eqp",
        "cod eqp",
        "código equipamento",
        "codigo equipamento",
        "máquina",
        "maquina",
      ).replace(/[^0-9]/g, ""),
    },
    route: routeValue
      .split(/[,;\s]+/)
      .filter((code) => /^\d+\.\d+$/.test(code))
      .map((code) => ({ code, frequency: 1 })),
  };
}

// ----------------------- PASSO 3 - LEITURA DO ARQUIVO TXT DA DEMANDA -----------------------

export function parseTxtDemand(text) {
  const entries = text
    .split(/\r?\n/)
    .map((line) => {
      const index = line.indexOf(":");
      return index >= 0
        ? [
            line.slice(0, index),
            line.slice(index + 1).replace(/^\s*["']|["']\s*$/g, ""),
          ]
        : null;
    })
    .filter(Boolean);
  return scenarioFromKeyValues(entries);
}

// ----------------------- PASSO 4 - LEITURA DE LINHAS E ARQUIVOS CSV -----------------------

// Separa as colunas sem quebrar textos que estejam entre aspas.
function parseDelimitedLine(line, separator) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === separator && !quoted) {
      cells.push(value.trim());
      value = "";
    } else value += char;
  }
  cells.push(value.trim());
  return cells;
}

export function parseCsvDemand(text) {
  // Detecta automaticamente se o arquivo utiliza ponto e vírgula ou vírgula.
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(Boolean);
  const separator =
    (lines[0]?.match(/;/g) || []).length >= (lines[0]?.match(/,/g) || []).length
      ? ";"
      : ",";
  const rows = lines.map((line) => parseDelimitedLine(line, separator));
  if (rows[0]?.length === 2) return scenarioFromKeyValues(rows);
  const headers = rows[0].map(cleanLabel);
  const at = (row, label) => row[headers.indexOf(cleanLabel(label))] || "";
  const data = rows.slice(1).filter((row) => row.some(Boolean));
  const first = data[0] || [];
  const route = data
    .map((row) => ({
      code: at(row, "código elemento") || at(row, "codigo elemento"),
      frequency:
        parseNumber(at(row, "frequência") || at(row, "frequencia")) || 1,
    }))
    .filter((entry) => /^\d+\.\d+$/.test(entry.code));
  return {
    form: {
      code: at(first, "código po") || at(first, "codigo po"),
      revision: at(first, "revisão") || at(first, "revisao") || "00",
      operation: at(first, "operação") || at(first, "operacao"),
      family: at(first, "família") || at(first, "familia"),
      size: at(first, "tamanho"),
      dimensions: at(first, "medidas") || "",
      stitches: at(first, "pontos/cm") || "",
      perimeter: at(first, "perímetro") || at(first, "perimetro") || "",
      machine: (at(first, "máquina") || at(first, "maquina")).split(/\s|-/)[0],
    },
    route,
  };
}

// ----------------------- PASSO 5 - DECODIFICAÇÃO DA ESTRUTURA INTERNA DO ODS -----------------------

// Converte o XML interno da planilha em texto legível.
function decodeXml(value) {
  return String(value)
    .replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_, count) =>
      " ".repeat(Number(count || 1)),
    )
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function rowsFromOds(arrayBuffer) {
  // Um arquivo ODS é um pacote compactado; o conteúdo principal fica em content.xml.
  const files = unzipSync(new Uint8Array(arrayBuffer));
  if (!files["content.xml"]) throw new Error("Planilha ODS sem content.xml.");
  const xml = strFromU8(files["content.xml"]);
  const sheets = {};
  const tablePattern =
    /<table:table\b[^>]*table:name="([^"]+)"[^>]*>([\s\S]*?)<\/table:table>/g;
  for (const tableMatch of xml.matchAll(tablePattern)) {
    const name = decodeXml(tableMatch[1]) || "Planilha";
    const rowPattern = /<table:table-row\b[^>]*>([\s\S]*?)<\/table:table-row>/g;
    sheets[name] = [...tableMatch[2].matchAll(rowPattern)]
      .map((rowMatch) => {
        const values = [];
        const cellPattern =
          /<table:(table-cell|covered-table-cell)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:\1>)/g;
        for (const cellMatch of rowMatch[1].matchAll(cellPattern)) {
          const repeatedMatch = cellMatch[2].match(
            /table:number-columns-repeated="(\d+)"/,
          );
          const repeated = Math.min(Number(repeatedMatch?.[1] || 1), 20);
          const value = normalize(decodeXml(cellMatch[3] || ""));
          for (let index = 0; index < repeated; index += 1) values.push(value);
        }
        while (values.length && !values.at(-1)) values.pop();
        return values;
      })
      .filter((row) => row.some(Boolean));
  }
  return sheets;
}

// ----------------------- PASSO 6 - EXTRAÇÃO DOS CATÁLOGOS DE ELEMENTOS E MÁQUINAS -----------------------

function extractCatalogs(sheets) {
  const result = {};
  const elementRows =
    sheets.MATRIZ_DE_ELEMENTOS || sheets["MATRIZ DE ELEMENTOS"];
  if (elementRows) {
    result.elements = elementRows
      .slice(1)
      .map((row) => {
        const values = row.filter(Boolean);
        const code = values.find(
          (value, index) => index > 0 && /^\d+\.\d+$/.test(value),
        );
        return code
          ? { code, description: values[0], time: parseNumber(values.at(-1)) }
          : null;
      })
      .filter(Boolean);
  }
  const machineRows = sheets["TEMPO-CM"];
  if (machineRows) {
    result.machines = machineRows
      .map((row) => row.filter(Boolean))
      .filter((row) => /^\d+$/.test(row[0]) && row.length >= 5)
      .map((row) => ({
        code: row[0],
        type: row[1],
        model: row[2],
        rpm: Number(String(row[3]).replace(/[^0-9]/g, "")),
        rate: parseNumber(row.at(-1)),
      }));
  }
  return result;
}

// ----------------------- PASSO 7 - EXTRAÇÃO DOS DADOS DA FICHA PO -----------------------

function extractPo(rows) {
  if (!rows?.length) return null;
  const nonEmpty = rows.map((row) => row.filter(Boolean));

  // Primeiro formato: planilha exportada pelo próprio TexFlow.
  if (cleanLabel(nonEmpty[0]?.[0]).includes("texflow processo operacional")) {
    const identity = String(nonEmpty[1]?.[0] || "")
      .split("|")
      .map((value) => value.trim());
    const product = nonEmpty[3] || [];
    const equipment = nonEmpty[4] || [];
    const elementHeaderIndex = nonEmpty.findIndex((row) =>
      row.some((cell) => cleanLabel(cell) === "codigo"),
    );
    return {
      form: {
        code: identity[0] || "",
        revision: (identity[1] || "00").replace(/[^0-9]/g, ""),
        operation: nonEmpty[2]?.[0] || "",
        family: product[1] || "",
        size: product[3] || "",
        dimensions: "",
        stitches: "",
        perimeter: String(parseNumber(equipment[3]) || ""),
        machine: String(equipment[1] || "").match(/^\d+/)?.[0] || "",
      },
      route: nonEmpty
        .slice(elementHeaderIndex + 1)
        .filter((row) => /^\d+\.\d+$/.test(row[0]))
        .map((row) => ({ code: row[0], frequency: parseNumber(row[2]) || 1 })),
    };
  }

  // Segundo formato: planilha oficial disponibilizada no desafio.
  const operationRow = nonEmpty.find(
    (row) => cleanLabel(row[0]) === "operacao",
  );
  const productHeaderIndex = nonEmpty.findIndex((row) =>
    row.some((cell) => cleanLabel(cell).includes("agrupamento familia")),
  );
  const machineHeaderIndex = nonEmpty.findIndex((row) =>
    row.some((cell) => cleanLabel(cell).includes("cod eqp")),
  );
  const elementHeaderIndex = nonEmpty.findIndex((row) =>
    row.some((cell) => cleanLabel(cell).includes("codigo do elemento")),
  );
  const product = nonEmpty[productHeaderIndex + 1] || [];
  const machine = nonEmpty[machineHeaderIndex + 1] || [];
  const route = nonEmpty
    .slice(elementHeaderIndex + 1)
    .filter((row) => /^\d+\.\d+$/.test(row[0]))
    .map((row) => ({ code: row[0], frequency: parseNumber(row[2]) || 1 }));
  return {
    form: {
      code: nonEmpty[0]?.[0] || "",
      revision: (nonEmpty[0]?.[1] || "00").replace(/[^0-9]/g, ""),
      operation: operationRow?.[1] || "",
      family: product[0] || "",
      size: product[1] || "",
      dimensions: product[2] || "",
      stitches: product[3] || "",
      perimeter: String(parseNumber(product[4]) || ""),
      machine: machine[0] || "",
    },
    route,
  };
}

// ----------------------- PASSO 8 - LEITORES PÚBLICOS DE ODS E XLSX -----------------------

export function parseOdsDemand(arrayBuffer) {
  const sheets = rowsFromOds(arrayBuffer);
  return { ...extractCatalogs(sheets), scenario: extractPo(sheets.PO) };
}

export async function parseXlsxDemand(arrayBuffer) {
  // O ExcelJS é carregado sob demanda para não aumentar o carregamento inicial do site.
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const sheets = {};
  workbook.eachSheet((sheet) => {
    sheets[sheet.name] = [];
    sheet.eachRow({ includeEmpty: false }, (row) =>
      sheets[sheet.name].push(
        row.values.slice(1).map((cell) => normalize(cell?.text ?? cell)),
      ),
    );
  });
  return {
    ...extractCatalogs(sheets),
    scenario: extractPo(sheets.PO || sheets[Object.keys(sheets)[0]]),
  };
}

// ----------------------- PASSO 9 - SELEÇÃO DO LEITOR PELO TIPO DO ARQUIVO -----------------------

export async function importTexFlowFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (extension === "txt")
    return { scenario: parseTxtDemand(await file.text()) };
  if (extension === "csv")
    return { scenario: parseCsvDemand(await file.text()) };
  const buffer = await file.arrayBuffer();
  if (extension === "ods") return parseOdsDemand(buffer);
  if (extension === "xlsx") return parseXlsxDemand(buffer);
  throw new Error("Formato não suportado. Use TXT, CSV, ODS ou XLSX.");
}
