// ----------------------- PASSO 1 - IMPORTAÇÕES E DOWNLOAD NO NAVEGADOR -----------------------

import { formatMinutes, parseNumber } from "./domain.js";

// Cria um link temporário para baixar o arquivo sem enviar dados para um servidor.
function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ----------------------- PASSO 2 - EXPORTAÇÃO DA FICHA EM CSV -----------------------

export function exportCsv(form, calculation) {
  const header = [
    "Código PO",
    "Revisão",
    "Operação",
    "Família",
    "Tamanho",
    "Medidas",
    "Pontos/cm",
    "Perímetro",
    "Máquina",
    "Código elemento",
    "Elemento",
    "Frequência",
    "Tempo unitário",
    "Subtotal",
  ];
  const identity = [
    form.code,
    form.revision,
    form.operation,
    form.family,
    form.size,
    form.dimensions,
    form.stitches,
    form.perimeter,
    `${calculation.machine.code} - ${calculation.machine.type}`,
  ];
  const rows = calculation.manualRows.map((row) => [
    ...identity,
    row.code,
    row.description,
    row.frequency,
    row.time.toFixed(4),
    row.subtotal.toFixed(4),
  ]);
  rows.unshift([
    ...identity,
    "FIXO",
    "Tempo de costura",
    1,
    calculation.fixed.toFixed(4),
    calculation.fixed.toFixed(4),
  ]);
  rows.push([
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "TEMPO TOTAL",
    "",
    "",
    calculation.total.toFixed(4),
  ]);
  const csv = [header, ...rows]
    .map((line) =>
      line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"),
    )
    .join("\n");
  downloadBlob(
    new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }),
    `${form.code || "ficha-po"}.csv`,
  );
}

// ----------------------- PASSO 3 - EXPORTAÇÃO DA FICHA EM XLSX -----------------------

export async function exportXlsx(form, calculation) {
  // A biblioteca é carregada somente quando o usuário solicita a planilha.
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TexFlow - Gabrielle Kyoko e Ana Luiza";
  const sheet = workbook.addWorksheet("Ficha PO", {
    views: [{ state: "frozen", ySplit: 7 }],
  });

  // Monta o cabeçalho e os dados de identificação da operação.
  sheet.columns = [{ width: 16 }, { width: 48 }, { width: 14 }, { width: 18 }];
  sheet.mergeCells("A1:D1");
  sheet.getCell("A1").value = "TexFlow - Processo Operacional";
  sheet.mergeCells("A2:D2");
  sheet.getCell("A2").value = `${form.code} | Rev. ${form.revision}`;
  sheet.mergeCells("A3:D3");
  sheet.getCell("A3").value = form.operation;
  sheet.getCell("A4").value = "Família";
  sheet.getCell("B4").value = form.family;
  sheet.getCell("C4").value = "Tamanho";
  sheet.getCell("D4").value = form.size;
  sheet.getCell("A5").value = "Equipamento";
  sheet.getCell("B5").value =
    `${calculation.machine.code} - ${calculation.machine.type} (${calculation.machine.model})`;
  sheet.getCell("C5").value = "Perímetro (m)";
  sheet.getCell("D5").value = parseNumber(form.perimeter);
  sheet.addRow([]);

  // Insere o tempo FIXO, o roteiro MTM e o total calculado.
  sheet.addRow(["Código", "Elemento", "Frequência", "Tempo (min)"]);
  sheet.addRow(["FIXO", "Tempo de costura", 1, calculation.fixed]);
  calculation.manualRows.forEach((row) =>
    sheet.addRow([row.code, row.description, row.frequency, row.subtotal]),
  );
  const totalRow = sheet.addRow(["", "", "TEMPO TOTAL", calculation.total]);

  // Aplica a identidade visual do TexFlow na planilha.
  ["A1:D1", "A2:D2"].forEach((range) => {
    sheet.getCell(range.split(":")[0]).font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
      size: range.startsWith("A1") ? 18 : 11,
    };
    sheet.getCell(range.split(":")[0]).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: range.startsWith("A1") ? "FF651B32" : "FFA66C1D" },
    };
    sheet.getCell(range.split(":")[0]).alignment = { horizontal: "center" };
  });
  const header = sheet.getRow(7);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF651B32" },
  };
  sheet.getColumn(4).numFmt = "0.0000";
  totalRow.font = { bold: true, color: { argb: "FF651B32" } };
  sheet.eachRow((row) => {
    row.alignment = { vertical: "middle", wrapText: true };
    row.height = Math.max(row.height || 15, 20);
  });
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${form.code || "ficha-po"}.xlsx`,
  );
}

// ----------------------- PASSO 4 - EXPORTAÇÃO DA FICHA EM PDF -----------------------

export async function exportPdf(form, calculation) {
  // As bibliotecas de PDF também são carregadas apenas quando necessárias.
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFillColor(101, 27, 50);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255, 248, 238);
  doc.setFontSize(19);
  doc.text("TexFlow - Processo Operacional", 14, 13);
  doc.setFontSize(10);
  doc.text(`${form.code} | Rev. ${form.revision}`, 14, 21);
  doc.setTextColor(53, 29, 35);
  doc.setFontSize(13);
  doc.text(form.operation || "Operação", 14, 38);
  doc.setFontSize(9);
  doc.text(
    `Família: ${form.family || "-"}   |   Tamanho: ${form.size || "-"}   |   Máquina: ${calculation.machine.code} - ${calculation.machine.type}`,
    14,
    46,
  );

  // Transforma o roteiro da tela em uma tabela pronta para impressão.
  autoTable(doc, {
    startY: 53,
    head: [["Código", "Elemento", "Frequência", "Tempo (min)"]],
    body: [
      ["FIXO", "Tempo de costura", "1", formatMinutes(calculation.fixed)],
      ...calculation.manualRows.map((row) => [
        row.code,
        row.description,
        String(row.frequency),
        formatMinutes(row.subtotal),
      ]),
    ],
    foot: [["", "", "TEMPO TOTAL", formatMinutes(calculation.total)]],
    theme: "grid",
    headStyles: { fillColor: [101, 27, 50] },
    footStyles: { fillColor: [166, 108, 29], fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 2.5 },
  });
  doc.setFontSize(8);
  doc.setTextColor(110, 90, 85);
  doc.text("Gerado pelo TexFlow - Gabrielle Kyoko e Ana Luiza", 14, 287);
  doc.save(`${form.code || "ficha-po"}.pdf`);
}
