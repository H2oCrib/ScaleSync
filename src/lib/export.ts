import ExcelJS from 'exceljs';
import type { StrainSession, StrainSummary } from './types';
import { GRAMS_PER_LB, VERIFICATION_TOLERANCE_GRAMS } from './types';
import {
  NAVY, LIGHT_BLUE, LIGHT_GRAY, GREEN_FILL, RED_FILL, STRAIN_HEADER,
  THIN_BORDER, BOLD_FONT, HEADER_FONT, TITLE_FONT,
} from './excel-styles';

export function computeSummaries(sessions: StrainSession[]): StrainSummary[] {
  return sessions.map(s => {
    const totalGrams = s.readings.reduce((sum, r) => sum + r.weightGrams, 0);
    const totalLbs = totalGrams / GRAMS_PER_LB;

    // Determine claimed in grams for comparison
    let claimedInGrams: number | null = null;
    if (s.config.claimedLbs != null) claimedInGrams = s.config.claimedLbs * GRAMS_PER_LB;
    else if (s.config.claimedGrams != null) claimedInGrams = s.config.claimedGrams;

    const differenceGrams = claimedInGrams != null ? totalGrams - claimedInGrams : null;

    const fullCount = s.readings.filter(r => !r.isPartial).length;
    const partialReadings = s.readings.filter(r => r.isPartial);

    return {
      strain: s.config.strain,
      type: s.config.type,
      units: fullCount + partialReadings.length,
      fullUnits: fullCount,
      partials: partialReadings.length,
      totalGrams: Math.round(totalGrams * 10) / 10,
      totalLbs: Math.round(totalLbs * 100) / 100,
      claimedLbs: s.config.claimedLbs,
      claimedGrams: s.config.claimedGrams,
      differenceGrams: differenceGrams != null ? Math.round(differenceGrams * 10) / 10 : null,
      status: differenceGrams != null
        ? (Math.abs(differenceGrams) <= VERIFICATION_TOLERANCE_GRAMS ? 'VERIFIED' : 'VARIANCE')
        : null,
    };
  });
}

export async function exportExcel(sessions: StrainSession[]) {
  const summaries = computeSummaries(sessions);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Weight Verification System';
  wb.created = new Date();

  // Determine if ANY strain has claimed weight
  const hasClaimed = summaries.some(s => s.claimedLbs != null || s.claimedGrams != null);

  // Build dynamic columns
  const headers: string[] = ['Strain', 'Type', 'Units', 'Total (g)', 'Total (LBS)'];
  const colWidths: number[] = [18, 10, 8, 12, 12];
  if (hasClaimed) {
    headers.push('Claimed', 'Difference (g)', 'Status');
    colWidths.push(14, 14, 16);
  }
  const colCount = headers.length;

  // ── Sheet 1: Summary ──
  const ws = wb.addWorksheet('Summary');

  // Title row
  const lastCol = String.fromCharCode(64 + colCount); // A=1, B=2, etc.
  ws.mergeCells(`A1:${lastCol}1`);
  const titleCell = ws.getCell('A1');
  titleCell.value = 'Weight Verification Summary';
  titleCell.font = TITLE_FONT;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  // Date row
  ws.mergeCells(`A2:${lastCol}2`);
  const dateCell = ws.getCell('A2');
  dateCell.value = `Date: ${new Date().toLocaleDateString()}`;
  dateCell.font = { name: 'Calibri', size: 11, color: { argb: 'FF666666' } };
  dateCell.alignment = { horizontal: 'center' };

  // Header row (row 4)
  const headerRow = ws.getRow(4);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = HEADER_FONT;
    cell.fill = NAVY;
    cell.alignment = { horizontal: i >= 2 ? 'center' : 'left', vertical: 'middle' };
    cell.border = THIN_BORDER;
  });
  headerRow.height = 24;

  // Data rows
  summaries.forEach((s, i) => {
    const row = ws.getRow(5 + i);
    row.getCell(1).value = s.strain;
    row.getCell(2).value = s.type;
    row.getCell(3).value = s.units;
    row.getCell(4).value = s.totalGrams;
    row.getCell(5).value = s.totalLbs;

    row.getCell(4).numFmt = '#,##0.0';
    row.getCell(5).numFmt = '#,##0.00';

    if (hasClaimed) {
      // Show claimed in the right unit
      if (s.claimedLbs != null) {
        row.getCell(6).value = `${s.claimedLbs} lbs`;
      } else if (s.claimedGrams != null) {
        row.getCell(6).value = `${s.claimedGrams} g`;
      } else {
        row.getCell(6).value = '';
      }
      row.getCell(7).value = s.differenceGrams ?? '';
      row.getCell(8).value = s.status ?? 'N/A';
      if (s.differenceGrams != null) row.getCell(7).numFmt = '+#,##0.0;-#,##0.0;0.0';
    }

    // Alternating row color + borders
    const isEven = i % 2 === 0;
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.border = THIN_BORDER;
      cell.font = { name: 'Calibri', size: 11 };
      if (c >= 2) cell.alignment = { horizontal: 'center' };
      if (isEven) cell.fill = LIGHT_GRAY;
    }

    // Status styling (only when claimed columns exist)
    if (hasClaimed) {
      const statusCell = row.getCell(8);
      statusCell.font = { ...BOLD_FONT };
      if (s.status === 'VERIFIED') {
        statusCell.fill = GREEN_FILL;
        statusCell.font = { ...BOLD_FONT, color: { argb: 'FF006100' } };
      } else if (s.status === 'VARIANCE') {
        statusCell.fill = RED_FILL;
        statusCell.font = { ...BOLD_FONT, color: { argb: 'FF9C0006' } };
      } else {
        statusCell.font = { ...BOLD_FONT, color: { argb: 'FF999999' } };
      }
    }

    row.height = 22;
  });

  // Grand Total row
  const grandRowNum = 5 + summaries.length;
  const grandRow = ws.getRow(grandRowNum);

  grandRow.getCell(1).value = 'GRAND TOTAL';
  grandRow.getCell(2).value = '';
  grandRow.getCell(3).value = summaries.reduce((s, r) => s + r.units, 0);
  grandRow.getCell(4).value = Math.round(summaries.reduce((s, r) => s + r.totalGrams, 0) * 10) / 10;
  grandRow.getCell(5).value = Math.round(summaries.reduce((s, r) => s + r.totalLbs, 0) * 100) / 100;

  grandRow.getCell(4).numFmt = '#,##0.0';
  grandRow.getCell(5).numFmt = '#,##0.00';

  if (hasClaimed) {
    const diffSummaries = summaries.filter(s => s.differenceGrams != null);
    const verifiableSummaries = summaries.filter(s => s.status != null);

    // Grand total claimed — mixed units, just leave blank
    grandRow.getCell(6).value = '';
    grandRow.getCell(7).value = diffSummaries.length > 0
      ? Math.round(diffSummaries.reduce((s, r) => s + r.differenceGrams!, 0) * 10) / 10
      : '';

    const allVerified = verifiableSummaries.length > 0 && verifiableSummaries.every(s => s.status === 'VERIFIED');
    grandRow.getCell(8).value = verifiableSummaries.length > 0
      ? (allVerified ? 'ALL VERIFIED' : 'HAS VARIANCE')
      : '';

    if (diffSummaries.length > 0) grandRow.getCell(7).numFmt = '+#,##0.0;-#,##0.0;0.0';

    // Grand total status styling
    const grandStatusCell = grandRow.getCell(8);
    if (verifiableSummaries.length > 0) {
      if (allVerified) {
        grandStatusCell.fill = GREEN_FILL;
        grandStatusCell.font = { ...BOLD_FONT, color: { argb: 'FF006100' } };
      } else {
        grandStatusCell.fill = RED_FILL;
        grandStatusCell.font = { ...BOLD_FONT, color: { argb: 'FF9C0006' } };
      }
    }
  }

  for (let c = 1; c <= colCount; c++) {
    const cell = grandRow.getCell(c);
    if (!cell.font?.bold) cell.font = BOLD_FONT;
    const existingArgb = (cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;
    const isStatusColored = existingArgb === 'FFC6EFCE' || existingArgb === 'FFFFC7CE';
    if (!isStatusColored) cell.fill = LIGHT_BLUE;
    cell.border = {
      ...THIN_BORDER,
      top: { style: 'medium', color: { argb: 'FF333333' } },
    };
    if (c >= 2) cell.alignment = { horizontal: 'center' };
  }

  grandRow.height = 24;

  // Column widths
  ws.columns = colWidths.map(width => ({ width }));

  // ── Sheet 2: Detail ──
  const detail = wb.addWorksheet('Detail');
  let detailRow = 1;

  for (const session of sessions) {
    // Strain header
    detail.mergeCells(`A${detailRow}:D${detailRow}`);
    const strainCell = detail.getCell(`A${detailRow}`);
    strainCell.value = `${session.config.strain} — ${session.config.type} (${session.readings.length} units)`;
    strainCell.font = { ...BOLD_FONT, size: 12 };
    strainCell.fill = STRAIN_HEADER;
    strainCell.border = THIN_BORDER;
    for (let c = 2; c <= 4; c++) {
      detail.getCell(detailRow, c).fill = STRAIN_HEADER;
      detail.getCell(detailRow, c).border = THIN_BORDER;
    }
    detail.getRow(detailRow).height = 24;
    detailRow++;

    // Column headers
    const detailHeaders = ['#', 'Weight (g)', 'Timestamp', ''];
    const dHeaderRow = detail.getRow(detailRow);
    detailHeaders.forEach((h, i) => {
      const cell = dHeaderRow.getCell(i + 1);
      cell.value = h;
      cell.font = HEADER_FONT;
      cell.fill = NAVY;
      cell.border = THIN_BORDER;
      cell.alignment = { horizontal: i === 1 ? 'center' : 'left' };
    });
    dHeaderRow.height = 22;
    detailRow++;

    // Readings
    session.readings.forEach((r, i) => {
      const row = detail.getRow(detailRow);
      row.getCell(1).value = r.unitNumber;
      row.getCell(2).value = r.weightGrams;
      row.getCell(2).numFmt = '#,##0.0';
      row.getCell(3).value = r.timestamp instanceof Date
        ? r.timestamp.toLocaleTimeString()
        : new Date(r.timestamp).toLocaleTimeString();

      for (let c = 1; c <= 3; c++) {
        const cell = row.getCell(c);
        cell.font = { name: 'Calibri', size: 11 };
        cell.border = THIN_BORDER;
        if (c === 1) cell.alignment = { horizontal: 'left' };
        if (c === 2) cell.alignment = { horizontal: 'center' };
        if (i % 2 === 0) cell.fill = LIGHT_GRAY;
      }
      detailRow++;
    });

    // Strain subtotal
    const subtotalRow = detail.getRow(detailRow);
    subtotalRow.getCell(1).value = 'Subtotal';
    subtotalRow.getCell(1).font = BOLD_FONT;
    const subtotalGrams = session.readings.reduce((sum, r) => sum + r.weightGrams, 0);
    subtotalRow.getCell(2).value = Math.round(subtotalGrams * 10) / 10;
    subtotalRow.getCell(2).numFmt = '#,##0.0';
    subtotalRow.getCell(2).font = BOLD_FONT;
    subtotalRow.getCell(2).alignment = { horizontal: 'center' };
    subtotalRow.getCell(3).value = `${(subtotalGrams / GRAMS_PER_LB).toFixed(2)} lbs`;
    subtotalRow.getCell(3).font = { ...BOLD_FONT, color: { argb: 'FF666666' } };
    for (let c = 1; c <= 3; c++) {
      subtotalRow.getCell(c).fill = LIGHT_BLUE;
      subtotalRow.getCell(c).border = {
        ...THIN_BORDER,
        top: { style: 'medium', color: { argb: 'FF333333' } },
      };
    }
    detailRow += 2; // blank row separator
  }

  // Detail column widths
  detail.columns = [
    { width: 8 },  // #
    { width: 14 }, // Weight (g)
    { width: 18 }, // Timestamp
    { width: 4 },
  ];

  // Generate and download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `weight-verification-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
