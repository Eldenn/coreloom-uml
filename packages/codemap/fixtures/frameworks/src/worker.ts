import { Worker } from 'bullmq'
import { saveOrder } from './orders-service.ts'
export const worker = new Worker('orders', async (job) => { saveOrder(job.data) })
