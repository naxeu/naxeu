import * as XLSX from "xlsx";
import type { ImportAnalyzeFormat, TabularSheet } from "@naxeu/shared";
import { guessHasHeaderRow, padRow, parseDelimitedText } from "@naxeu/shared";

export function detectImportFormatFromName(name: string): ImportAnalyzeFormat {
  const l = name.toLowerCase();
  if (l.endsWith(".xlsx") || l.endsWith(".xls")) return "xlsx";
  if (l.endsWith(".tsv")) return "tsv";
  return "csv";
}

export function bufferToTabular(format: ImportAnalyzeFormat, buffer: Buffer): TabularSheet {
  if (format === "xlsx") {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      return { headers: [], rows: [], hasHeader: true, delimiter: "," };
    }
    const sheet = wb.Sheets[sheetName];
    if (!sheet) {
      return { headers: [], rows: [], hasHeader: true, delimiter: "," };
    }
    const aoa = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];
    const stringRows = aoa.map((r) =>
      (r ?? []).map((c) => (c === null || c === undefined ? "" : String(c)).trim()),
    );
    if (stringRows.length === 0) {
      return { headers: [], rows: [], hasHeader: true, delimiter: "," };
    }
    const row0 = stringRows[0] ?? [];
    const row1 = stringRows[1];
    const hasHeader = guessHasHeaderRow(row0, row1);
    const width = Math.max(row0.length, ...stringRows.map((r) => r.length), 1);
    if (!hasHeader) {
      const headers = Array.from({ length: width }, (_, i) => `Spalte ${i + 1}`);
      const rows = stringRows.map((r) => padRow(r, width));
      return { headers, rows, hasHeader: false, delimiter: "," };
    }
    const headers = padRow(row0, width);
    const rows = stringRows.slice(1).map((r) => padRow(r, width));
    return { headers, rows, hasHeader: true, delimiter: "," };
  }
  const text = buffer.toString("utf8");
  if (format === "tsv") {
    return parseDelimitedText(text, "\t");
  }
  return parseDelimitedText(text);
}
