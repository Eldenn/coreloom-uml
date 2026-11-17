import { Job } from '@nemoventures/adonis-jobs'
export default class SendMailJob extends Job<{}, void> {
  async process() { return deliver() }
}
function deliver() {}
