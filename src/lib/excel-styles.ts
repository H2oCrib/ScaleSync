import type ExcelJS from 'exceljs';

export const NAVY: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2A4A' } };
export const LIGHT_BLUE: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };
export const LIGHT_GRAY: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
export const GREEN_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
export const RED_FILL: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
export const STRAIN_HEADER: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };

export const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
  left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
  bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
  right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
};

export const BOLD_FONT: Partial<ExcelJS.Font> = { bold: true, name: 'Calibri', size: 11 };
export const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, name: 'Calibri', size: 11, color: { argb: 'FFFFFFFF' } };
export const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, name: 'Calibri', size: 16 };
