import { Router } from 'express'
import { saveOrder } from '../orders-service.ts'
export function listOrders(req: any, res: any) { res.json([]) }
export function createOrder(req: any, res: any) { saveOrder(req.body); res.status(201).end() }
export const router = Router()
router.delete('/orders/:id', (req, res) => res.end())
