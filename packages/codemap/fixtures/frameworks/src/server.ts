import express from 'express'
import { listOrders, createOrder } from './routes/orders.ts'
const app = express()
app.get('/orders', listOrders)
app.post('/orders', createOrder)
app.get('/health', (req, res) => res.send('ok'))
app.listen(3000)
