import type { AuditLogEntry } from './list-audit-logs.types';

const AUDIT_LOG_CSV_HEADER = [
  'time',
  'action',
  'entity_type',
  'entity_id',
  'entity_public_id',
  'actor_email',
  'request_id',
  'summary',
];

/**
 * RFC 4180 CSV: fields containing a comma, quote, CR or LF are wrapped in
 * double quotes, and embedded double quotes are doubled.
 */
function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

export function buildAuditLogCsv(entries: AuditLogEntry[]): string {
  const rows = [
    AUDIT_LOG_CSV_HEADER.join(','),
    ...entries.map((entry) => [
      entry.createdAt.toISOString(),
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.entityPublicId ?? '',
      entry.actorEmail ?? '',
      entry.requestId ?? '',
      JSON.stringify(entry.summary ?? {}),
    ].map(escapeCsvCell).join(',')),
  ];

  return rows.join('\r\n');
}
