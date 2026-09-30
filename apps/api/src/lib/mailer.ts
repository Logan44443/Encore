import { env } from "../env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 * Development mailer: prints the email to the API log so the code can be
 * copied from the terminal. Never used in production, where it would leak
 * reset codes into the logs.
 */
const logMailer: Mailer = {
  async send(mail) {
    console.log(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
  },
};

/** Production until a real provider is plugged in: drops the email and says so. */
const unconfiguredMailer: Mailer = {
  async send(mail) {
    console.warn(`[mail] no email provider configured; dropped "${mail.subject}"`);
  },
};

/** Swap in a real provider (Resend, Postmark, SES, …) here. */
let current: Mailer = env.isProd ? unconfiguredMailer : logMailer;

export const mailer: Mailer = { send: (mail) => current.send(mail) };

/** For tests, or to plug in a provider at startup. */
export function setMailer(next: Mailer) {
  current = next;
}
