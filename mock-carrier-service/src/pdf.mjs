/**
 * Renders a label as a minimal but structurally valid single-page PDF 1.4
 * document. Dependency-free on purpose: the mock only needs a real PDF that a
 * client can decode, store and (optionally) open — not a printable barcode.
 */

/** 4 × 6 inches, the usual 4x6 thermal label proportion, in PDF points. */
const PAGE_WIDTH = 288;
const PAGE_HEIGHT = 432;
const MARGIN = 24;
const LINE_HEIGHT = 16;

function escapeText(value) {
  // PDF literal strings escape backslash and both parentheses; drop anything
  // outside printable ASCII so byte offsets stay exact.
  return String(value)
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/[\\()]/g, (character) => `\\${character}`);
}

/**
 * Builds the PDF bytes for one purchased label.
 *
 * @param {object} label
 * @param {string} label.label_id
 * @param {string} label.carrier
 * @param {string} label.service
 * @param {string} label.tracking_number
 * @param {number} label.price_minor
 * @param {string} label.currency
 * @returns {Buffer}
 */
export function buildLabelPdf(label) {
  const lines = [
    'MOCK CARRIER LABEL',
    `Label: ${label.label_id}`,
    `Carrier: ${label.carrier}`,
    `Service: ${label.service}`,
    `Tracking: ${label.tracking_number}`,
    `Price: ${label.price_minor} ${label.currency}`,
  ];

  const text = [
    'BT',
    `/F1 10 Tf`,
    `${MARGIN} ${PAGE_HEIGHT - MARGIN} Td`,
    `${LINE_HEIGHT} TL`,
    ...lines.map((line) => `(${escapeText(line)}) Tj T*`),
    'ET',
  ].join('\n');
  // A trailing newline after the stream keyword is allowed; /Length covers the
  // exact bytes between `stream\n` and `\nendstream`.
  const stream = `${text}\n`;

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}endstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const startxref = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  return Buffer.from(pdf, 'ascii');
}
