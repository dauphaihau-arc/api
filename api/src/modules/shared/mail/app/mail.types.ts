export interface MailAddress {
  email: string;
  name?: string;
}

export interface SendMailInput {
  to: MailAddress | MailAddress[];
  subject: string;
  text?: string;
  html?: string;
  from?: MailAddress;
  replyTo?: MailAddress | MailAddress[];
  cc?: MailAddress[];
  bcc?: MailAddress[];
  tags?: string[];
}
