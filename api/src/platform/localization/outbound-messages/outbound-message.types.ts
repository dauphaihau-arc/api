import type { StorefrontLanguage } from '~/platform/config/marketplace.config';

/**
 * One channel message as authored in a Message Catalog. Copy is plain text;
 * `{{key}}` placeholders are filled from template data by the renderer, which
 * owns interpolation and channel escaping.
 */
export interface OutboundEmailTemplate {
  subject: string;
  heading: string;
  paragraphs: readonly string[];
  action?: {
    label: string;
    url: string;
  };
}

export interface OutboundNotificationTemplate {
  title: string;
  body: string;
}

export type OutboundMessageTemplate =
  | { email: OutboundEmailTemplate; notification?: OutboundNotificationTemplate }
  | { email?: OutboundEmailTemplate; notification: OutboundNotificationTemplate };

/**
 * English is the required source template; other Storefront Languages are
 * optional so a missing translation falls the whole message back to English.
 */
export type OutboundMessageLanguageCatalog = {
  en: OutboundMessageTemplate;
} & Partial<Record<StorefrontLanguage, OutboundMessageTemplate>>;

export type OutboundMessageCatalog = Record<string, OutboundMessageLanguageCatalog>;

export type OutboundMessageData = Record<string, string | number>;

export interface RenderedOutboundMessage {
  subject?: string;
  title?: string;
  text: string;
  html?: string;
  push?: { title: string; body: string };
}

export type RenderedEmailMessage = RenderedOutboundMessage & {
  subject: string;
  html: string;
};

export interface RenderedNotificationMessage {
  title: string;
  body: string;
}
