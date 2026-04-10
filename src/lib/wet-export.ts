import ExcelJS from 'exceljs';
import type { HarvestSession, HarvestSummary } from './types';
import { GRAMS_PER_LB } from './types';
import {
  NAVY, LIGHT_BLUE, LIGHT_GRAY, STRAIN_HEADER,
  THIN_BORDER, BOLD_FONT, HEADER_FONT, TITLE_FONT,
} from './excel-styles';

function computeHarvestSummaries(session: HarvestSession): HarvestSummary[] {
  return session.config.strains.map(sc => {
    const strainReadings = session.readings.filter(r => r.strain === sc.strain);
    const totalGrams = strainReadings.reduce((sum, r) => sum + r.weightGrams, 0);
    return {
      strain: sc.strain,
      plantCount: sc.plantCount,
      plantsWeighed: strainReadings.length,
      totalGrams: Math.round(totalGrams * 10) / 10,
      totalLbs: Math.round((totalGrams / GRAMS_PER_LB) * 100) / 100,
      avgPerPlant: strainReadings.length > 0
        ? Math.round((totalGrams / strainReadings.length) * 10) / 10
        : 0,
    };
  });
}

export async function exportWetExcel(session: HarvestSession) {
  const summaries = computeHarvestSummaries(session);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wet Weight Harvest System';
  wb.created = new Date();

  const headers = ['Strain', 'Expected', 'Weighed', 'Total (g)', 'Total (LBS)', 'Avg / Plant (g)'];
  const colWidths = [18, 10, 10, 14, 14, 16];
  const colCount = headers.length;
  const lastCol = String.fromCharCode(64 + colCount);

  // ── Sheet 1: Summary ──
  const ws = wb.addWorksheet('Summary');

  // Title
  ws.mergeCells(`A1:${lastCol}1`);
  const titleCell = ws.getCell('A1');
  titleCell.value = 'Wet Weight Harvest Summary';
  titleCell.font = TITLE_FONT;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  // Batch name
  ws.mergeCells(`A2:${lastCol}2`);
  const batchCell = ws.getCell('A2');
  batchCell.value = session.config.batchName;
  batchCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF444444' } };
  batchCell.alignment = { horizontal: 'center' };

  // Date
  ws.mergeCells(`A3:${lastCol}3`);
  const dateCell = ws.getCell('A3');
  const dateVal = session.config.date instanceof Date ? session.config.date : new Date(session.config.date);
  dateCell.value = `Date: ${dateVal.toLocaleDateString()}`;
  dateCell.font = { name: 'Calibri', size: 11, color: { argb: 'FF666666' } };
  dateCell.alignment = { horizontal: 'center' };

  // Header row (row 5)
  const headerRow = ws.getRow(5);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = HEADER_FONT;
    cell.fill = NAVY;
    cell.alignment = { horizontal: i >= 1 ? 'center' : 'left', vertical: 'middle' };
    cell.border = THIN_BORDER;
  });
  headerRow.height = 24;

  // Data rows
  summaries.forEach((s, i) => {
    const row = ws.getRow(6 + i);
    row.getCell(1).value = s.strain;
    row.getCell(2).value = s.plantCount;
    row.getCell(3).value = s.plantsWeighed;
    row.getCell(4).value = s.totalGrams;
    row.getCell(5).value = s.totalLbs;
    row.getCell(6).value = s.avgPerPlant;

    row.getCell(4).numFmt = '#,##0.0';
    row.getCell(5).numFmt = '#,##0.00';
    row.getCell(6).numFmt = '#,##0.0';

    const isEven = i % 2 === 0;
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.border = THIN_BORDER;
      cell.font = { name: 'Calibri', size: 11 };
      if (c >= 2) cell.alignment = { horizontal: 'center' };
      if (isEven) cell.fill = LIGHT_GRAY;
    }
    row.height = 22;
  });

  // Grand Total row
  const grandRowNum = 6 + summaries.length;
  const grandRow = ws.getRow(grandRowNum);

  const grandPlants = summaries.reduce((s, r) => s + r.plantCount, 0);
  const grandWeighed = summaries.reduce((s, r) => s + r.plantsWeighed, 0);
  const grandGrams = Math.round(summaries.reduce((s, r) => s + r.totalGrams, 0) * 10) / 10;
  const grandLbs = Math.round(summaries.reduce((s, r) => s + r.totalLbs, 0) * 100) / 100;
  const grandAvg = grandWeighed > 0 ? Math.round((grandGrams / grandWeighed) * 10) / 10 : 0;

  grandRow.getCell(1).value = 'GRAND TOTAL';
  grandRow.getCell(2).value = grandPlants;
  grandRow.getCell(3).value = grandWeighed;
  grandRow.getCell(4).value = grandGrams;
  grandRow.getCell(5).value = grandLbs;
  grandRow.getCell(6).value = grandAvg;

  grandRow.getCell(4).numFmt = '#,##0.0';
  grandRow.getCell(5).numFmt = '#,##0.00';
  grandRow.getCell(6).numFmt = '#,##0.0';

  for (let c = 1; c <= colCount; c++) {
    const cell = grandRow.getCell(c);
    cell.font = BOLD_FONT;
    cell.fill = LIGHT_BLUE;
    cell.border = {
      ...THIN_BORDER,
      top: { style: 'medium', color: { argb: 'FF333333' } },
    };
    if (c >= 2) cell.alignment = { horizontal: 'center' };
  }
  grandRow.height = 24;

  ws.columns = colWidths.map(width => ({ width }));

  // ── Sheet 2: Detail ──
  const detail = wb.addWorksheet('Detail');
  let detailRow = 1;

  for (const sc of session.config.strains) {
    const strainReadings = session.readings.filter(r => r.strain === sc.strain);
    if (strainReadings.length === 0) continue;

    // Strain header
    detail.mergeCells(`A${detailRow}:E${detailRow}`);
    const strainCell = detail.getCell(`A${detailRow}`);
    strainCell.value = `${sc.strain} — ${strainReadings.length} plants`;
    strainCell.font = { ...BOLD_FONT, size: 12 };
    strainCell.fill = STRAIN_HEADER;
    strainCell.border = THIN_BORDER;
    for (let c = 2; c <= 5; c++) {
      detail.getCell(detailRow, c).fill = STRAIN_HEADER;
      detail.getCell(detailRow, c).border = THIN_BORDER;
    }
    detail.getRow(detailRow).height = 24;
    detailRow++;

    // Column headers
    const detailHeaders = ['#', 'METRC Tag', 'Weight (g)', 'Timestamp', ''];
    const dHeaderRow = detail.getRow(detailRow);
    detailHeaders.forEach((h, i) => {
      const cell = dHeaderRow.getCell(i + 1);
      cell.value = h;
      cell.font = HEADER_FONT;
      cell.fill = NAVY;
      cell.border = THIN_BORDER;
      cell.alignment = { horizontal: i === 2 ? 'center' : 'left' };
    });
    dHeaderRow.height = 22;
    detailRow++;

    // Readings
    strainReadings.forEach((r, i) => {
      const row = detail.getRow(detailRow);
      row.getCell(1).value = r.plantNumber;
      row.getCell(2).value = r.tagId;
      row.getCell(3).value = r.weightGrams;
      row.getCell(3).numFmt = '#,##0.0';
      row.getCell(4).value = r.timestamp instanceof Date
        ? r.timestamp.toLocaleTimeString()
        : new Date(r.timestamp).toLocaleTimeString();

      for (let c = 1; c <= 4; c++) {
        const cell = row.getCell(c);
        cell.font = { name: 'Calibri', size: 11 };
        cell.border = THIN_BORDER;
        if (c === 3) cell.alignment = { horizontal: 'center' };
        if (i % 2 === 0) cell.fill = LIGHT_GRAY;
      }
      detailRow++;
    });

    // Strain subtotal
    const subtotalRow = detail.getRow(detailRow);
    subtotalRow.getCell(1).value = 'Subtotal';
    subtotalRow.getCell(1).font = BOLD_FONT;
    const subtotalGrams = strainReadings.reduce((sum, r) => sum + r.weightGrams, 0);
    subtotalRow.getCell(3).value = Math.round(subtotalGrams * 10) / 10;
    subtotalRow.getCell(3).numFmt = '#,##0.0';
    subtotalRow.getCell(3).font = BOLD_FONT;
    subtotalRow.getCell(3).alignment = { horizontal: 'center' };
    subtotalRow.getCell(4).value = `${(subtotalGrams / GRAMS_PER_LB).toFixed(2)} lbs`;
    subtotalRow.getCell(4).font = { ...BOLD_FONT, color: { argb: 'FF666666' } };
    for (let c = 1; c <= 4; c++) {
      subtotalRow.getCell(c).fill = LIGHT_BLUE;
      subtotalRow.getCell(c).border = {
        ...THIN_BORDER,
        top: { style: 'medium', color: { argb: 'FF333333' } },
      };
    }
    detailRow += 2;
  }

  // Detail column widths
  detail.columns = [
    { width: 8 },
    { width: 28 },
    { width: 14 },
    { width: 18 },
    { width: 4 },
  ];

  // Generate and download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = session.config.batchName.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
  a.download = `wet-weight-${safeName}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
