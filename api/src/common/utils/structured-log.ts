export type StructuredLogValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | StructuredLogRecord
  | StructuredLogValue[];

export interface StructuredLogRecord {
  [key: string]: StructuredLogValue;
}

export function buildStructuredLog(payload: StructuredLogRecord): string {
  return JSON.stringify(pruneUndefined(payload));
}

function pruneUndefined(value: StructuredLogValue): StructuredLogValue {
  if (Array.isArray(value)) {
    return value.map(pruneUndefined);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .map(([key, entryValue]) => [key, pruneUndefined(entryValue)]);

  return Object.fromEntries(entries);
}
