import {
  DEFAULT_STOREFRONT_LANGUAGE,
  type StorefrontLanguage,
} from '~/platform/config/marketplace.config';
import { normalizeStorefrontLanguage } from '../storefront-language';
import { renderOutboundEmailLayout } from './outbound-email-layout';
import type {
  OutboundMessageCatalog,
  OutboundMessageData,
  RenderedEmailMessage,
  RenderedNotificationMessage,
} from './outbound-message.types';

export class UnknownOutboundMessageError extends Error {
  constructor(messageId: string, language: string) {
    super(`No outbound message template for "${messageId}" in "${language}"`);
    this.name = UnknownOutboundMessageError.name;
  }
}

export class MissingOutboundMessageDataError extends Error {
  constructor(messageId: string, key: string) {
    super(`Outbound message "${messageId}" is missing template data "${key}"`);
    this.name = MissingOutboundMessageDataError.name;
  }
}

/**
 * Selects the one language used for the whole message. Missing Vietnamese copy
 * falls back to English; languages are never mixed field by field.
 */
export function resolveOutboundMessageLanguage(
  catalog: OutboundMessageCatalog,
  messageId: string,
  language: string,
): StorefrontLanguage {
  const entry = catalog[messageId];

  if (!entry) {
    throw new UnknownOutboundMessageError(messageId, language);
  }

  const requested = normalizeStorefrontLanguage(language);

  if (entry[requested]) {
    return requested;
  }

  if (entry[DEFAULT_STOREFRONT_LANGUAGE]) {
    return DEFAULT_STOREFRONT_LANGUAGE;
  }

  throw new UnknownOutboundMessageError(messageId, language);
}

export interface RenderOutboundEmailRequest {
  messageId: string;
  language: string;
  data: OutboundMessageData;
}

export interface RenderOutboundNotificationRequest {
  messageId: string;
  language: string;
  data: OutboundMessageData;
}

/**
 * The single backend copy seam for buyer Outbound Messages. It resolves one
 * message identity into the Recipient Language and returns channel-ready
 * content. Interpolation happens here; HTML escaping belongs to the layout at
 * the HTML channel boundary.
 */
export class OutboundMessageRenderer {
  renderEmail(
    catalog: OutboundMessageCatalog,
    request: RenderOutboundEmailRequest,
  ): RenderedEmailMessage {
    const { messageId, data } = request;
    const language = resolveOutboundMessageLanguage(catalog, messageId, request.language);
    const template = catalog[messageId][language]?.email;

    if (!template) {
      throw new UnknownOutboundMessageError(messageId, request.language);
    }

    const subject = this.interpolate(template.subject, messageId, data);
    const heading = this.interpolate(template.heading, messageId, data);

    const paragraphs = template.paragraphs.map((paragraph) =>
      this.interpolate(paragraph, messageId, data));

    const action = template.action
      ? {
        label: this.interpolate(template.action.label, messageId, data),
        url: this.interpolate(template.action.url, messageId, data),
      }
      : undefined;

    const textSections = [heading, ...paragraphs];
    if (action) {
      textSections.push(`${action.label}: ${action.url}`);
    }

    return {
      subject,
      text: textSections.join('\n\n'),
      html: renderOutboundEmailLayout({
        language,
        subject,
        heading,
        paragraphs,
        action,
      }),
    };
  }

  renderNotification(
    catalog: OutboundMessageCatalog,
    request: RenderOutboundNotificationRequest,
  ): RenderedNotificationMessage {
    const { messageId, data } = request;
    const language = resolveOutboundMessageLanguage(catalog, messageId, request.language);
    const template = catalog[messageId][language]?.notification;

    if (!template) {
      throw new UnknownOutboundMessageError(messageId, request.language);
    }

    return {
      title: this.interpolate(template.title, messageId, data),
      body: this.interpolate(template.body, messageId, data),
    };
  }

  private interpolate(
    template: string,
    messageId: string,
    data: OutboundMessageData,
  ): string {
    return template.replace(
      /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g,
      (_placeholder, key: string) => {
        const value = data[key];

        if (value === undefined) {
          throw new MissingOutboundMessageDataError(messageId, key);
        }

        return String(value);
      },
    );
  }
}
