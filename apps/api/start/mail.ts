import mail from '@adonisjs/mail/services/main'
import SendMailJob from '#app/jobs/send-mail_job'

/**
 * Route every `mail.sendLater(...)` through the BullMQ queue.
 *
 * `@adonisjs/mail` compiles the message (runs `prepare()`, renders views), then
 * hands it to this messenger instead of its default in-memory queue.
 * `SendMailJob` does the actual SMTP send on the `queue:work` worker — with
 * retries, and every send inspectable / replayable in bull-board.
 *
 * `mail.fake()` bypasses the messenger entirely, so tests keep asserting with
 * `fake.mails.assertQueued(...)`.
 */
mail.setMessenger((mailer) => ({
  async queue({ message, views }) {
    await SendMailJob.dispatch({ mailerName: mailer.name, message, views })
  },
}))
