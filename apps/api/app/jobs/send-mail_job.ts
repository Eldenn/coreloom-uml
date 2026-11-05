import mail from '@adonisjs/mail/services/main'
import type { MailersList, MessageBodyTemplates, NodeMailerMessage } from '@adonisjs/mail/types'
import { Job } from '@nemoventures/adonis-jobs'
import type { BullJobsOptions } from '@nemoventures/adonis-jobs/types'

/**
 * Delivers one compiled transactional email.
 *
 * Not dispatched by hand — `start/mail.ts` registers this as the mail
 * messenger, so every existing `mail.sendLater(...)` call site enqueues one of
 * these. Retries on SMTP failure (BullMQ `attempts`); a send that fails every
 * attempt is logged by `onFailed` and left visible in bull-board.
 *
 * ponytail: the payload assumes a JSON-serializable compiled message — our
 * mails only set `to` / `subject` / `html`. Stream or buffer attachments would
 * need encoding here first.
 */
export type SendMailJobData = {
  mailerName: string
  message: NodeMailerMessage
  views: MessageBodyTemplates
}

export default class SendMailJob extends Job<SendMailJobData, void> {
  static options: BullJobsOptions = {
    attempts: 5,
    backoff: { type: 'exponential', delay: 10_000 },
  }

  async process(): Promise<void> {
    const { mailerName, message, views } = this.data
    await mail.use(mailerName as keyof MailersList).sendCompiled({ message, views })
  }

  async onFailed(): Promise<void> {
    this.logger.error(
      { err: this.error, mailerName: this.data.mailerName, to: this.data.message.to },
      'transactional email delivery failed after all retries',
    )
  }
}
