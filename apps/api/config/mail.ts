import { defineConfig, transports } from '@adonisjs/mail'
import env from '#start/env'

const smtpUsername = env.get('SMTP_USERNAME')

const mailConfig = defineConfig({
  default: 'smtp',

  from: {
    address: env.get('MAIL_FROM_ADDRESS'),
    name: env.get('MAIL_FROM_NAME', 'Coreloom UML'),
  },

  mailers: {
    smtp: transports.smtp({
      host: env.get('SMTP_HOST'),
      port: env.get('SMTP_PORT'),
      secure: false,
      auth: smtpUsername
        ? { type: 'login', user: smtpUsername, pass: env.get('SMTP_PASSWORD', '') }
        : undefined,
    }),
  },
})

export default mailConfig

declare module '@adonisjs/mail/types' {
  export interface MailersList extends InferMailers<typeof mailConfig> {}
}
