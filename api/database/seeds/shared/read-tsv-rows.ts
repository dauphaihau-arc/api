import { readFileSync } from 'node:fs';

function parseTsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === '\t' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i += 1;
      }

      row.push(cell);
      cell = '';

      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

export function readTsvRows<T extends Record<string, string>>(filePath: string): T[] {
  const raw = readFileSync(filePath, 'utf8');
  const [headerRow, ...dataRows] = parseTsv(raw);

  if (!headerRow) {
    throw new Error(`TSV file is empty: ${filePath}`);
  }

  return dataRows.map((row, index) => {
    if (row.length !== headerRow.length) {
      throw new Error(
        `TSV row ${index + 2} in ${filePath} has ${row.length} columns, expected ${headerRow.length}`
      );
    }

    return Object.fromEntries(
      headerRow.map((header, columnIndex) => [header, row[columnIndex] ?? ''])
    ) as T;
  });
}
