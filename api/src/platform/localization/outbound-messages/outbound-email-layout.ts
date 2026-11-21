import type { StorefrontLanguage } from '~/platform/config/marketplace.config';

export interface OutboundEmailLayoutInput {
  language: StorefrontLanguage;
  subject: string;
  heading: string;
  paragraphs: readonly string[];
  action?: {
    label: string;
    url: string;
  };
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&#39;',
};

/**
 * Escapes text and attribute values at the HTML channel boundary. Catalog copy
 * and template data are plain text, so every interpolated value passes through
 * here before it becomes markup.
 */
function escapeOutboundHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

/**
 * The one responsive layout for transactional email. It is deliberately
 * minimal: a stacked, inline-styled table that keeps a readable measure on
 * mobile and leaves body copy to the catalog.
 */
export function renderOutboundEmailLayout(input: OutboundEmailLayoutInput): string {
  const subject = escapeOutboundHtml(input.subject);
  const heading = escapeOutboundHtml(input.heading);
  const paragraphs = input.paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px;">${escapeOutboundHtml(paragraph)}</p>`)
    .join('');
  const action = input.action
    ? `<p style="margin:24px 0 0;"><a href="${escapeOutboundHtml(input.action.url)}" ` +
      'style="display:inline-block;padding:12px 20px;background-color:#111827;' +
      'color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">' +
      `${escapeOutboundHtml(input.action.label)}</a></p>`
    : '';

  return `<!doctype html>
<html lang="${escapeOutboundHtml(input.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${subject}</title>
<style>
@media (max-width: 600px) {
  .arc-email-container { padding: 20px 12px !important; }
  .arc-email-content { padding: 24px 20px !important; }
  .arc-email-heading { font-size: 22px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;">
<tr>
<td class="arc-email-container" align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;">
<tr>
<td class="arc-email-content" style="padding:40px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:16px;line-height:1.6;">
<h1 class="arc-email-heading" style="margin:0 0 24px;font-size:26px;line-height:1.2;color:#111827;">${heading}</h1>
${paragraphs}
${action}
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}
