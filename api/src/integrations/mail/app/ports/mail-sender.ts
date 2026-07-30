import type { SendMailInput } from '../mail.types';

export abstract class MailSender {
  abstract send(input: SendMailInput): Promise<void>;
}
