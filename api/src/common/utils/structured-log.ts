import type {
  StructuredLogRecord,
  StructuredLogValue
} from '../logging/structured-log.types';

export function buildStructuredLog(
  payload: StructuredLogRecord
): StructuredLogRecord {
  return pruneUndefined(payload) as StructuredLogRecord;
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
