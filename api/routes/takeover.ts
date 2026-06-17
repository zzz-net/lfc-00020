import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import {
  listPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  getPortOccupier,
  executeTakeover,
  listReceipts,
  getReceiptById,
  getLastReceipt,
  undoLastReceipt,
  getLastSuccessfulPlan,
  exportPlans,
  importPlans,
  isAdmin,
  canModifyPlan,
} from '../services/takeover.js';
import type { TakeoverAction } from '../../shared/types.js';

const router = express.Router();

function _getUsername(req: Request): string {
  return (req.headers['x-username'] as string) || 'admin';
}

router.get('/plans', (req: Request, res: Response): void => {
  try {
    const username = _getUsername(req);
    const plans = listPlans(username);
    res.json({ success: true, data: plans });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

const createPlanSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  scope: z.enum(['public', 'private']),
  frontendCommand: z.string().optional(),
  backendCommand: z.string().optional(),
  expectedPort: z.number().int().min(1).max(65535),
  homePageUrl: z.string().url(),
  apiHealthUrl: z.string().url(),
  timeoutSec: z.number().int().min(5).max(600),
  ownerUsername: z.string().optional(),
});

router.post('/plans', (req: Request, res: Response): void => {
  try {
    const username = _getUsername(req);
    const parsed = createPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues });
      return;
    }
    const data = parsed.data;
    const owner = data.ownerUsername || username;
    if (data.scope === 'public' && !isAdmin(username)) {
      res.status(403).json({ success: false, error: '仅管理员可创建公共方案' });
      return;
    }
    if (owner !== username && !isAdmin(username)) {
      res.status(403).json({ success: false, error: '无权为他人创建方案' });
      return;
    }
    const plan = createPlan({
      name: data.name,
      description: data.description,
      scope: data.scope,
      ownerUsername: owner,
      frontendCommand: data.frontendCommand,
      backendCommand: data.backendCommand,
      expectedPort: data.expectedPort,
      homePageUrl: data.homePageUrl,
      apiHealthUrl: data.apiHealthUrl,
      timeoutSec: data.timeoutSec,
    });
    res.status(201).json({ success: true, data: plan });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

const updatePlanSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  scope: z.enum(['public', 'private']).optional(),
  frontendCommand: z.string().optional(),
  backendCommand: z.string().optional(),
  expectedPort: z.number().int().min(1).max(65535).optional(),
  homePageUrl: z.string().url().optional(),
  apiHealthUrl: z.string().url().optional(),
  timeoutSec: z.number().int().min(5).max(600).optional(),
});

router.put('/plans/:id', (req: Request, res: Response): void => {
  try {
    const username = _getUsername(req);
    const id = Number(req.params.id);
    const plan = getPlanById(id);
    if (!plan) {
      res.status(404).json({ success: false, error: '方案不存在' });
      return;
    }
    if (!canModifyPlan(username, plan)) {
      res.status(403).json({ success: false, error: '无权修改此方案' });
      return;
    }
    const parsed = updatePlanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues });
      return;
    }
    const data = parsed.data;
    if (data.scope === 'public' && !isAdmin(username)) {
      res.status(403).json({ success: false, error: '仅管理员可设置公共方案' });
      return;
    }
    const updated = updatePlan(id, data);
    res.json({ success: true, data: updated });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/plans/:id', (req: Request, res: Response): void => {
  try {
    const username = _getUsername(req);
    const id = Number(req.params.id);
    const plan = getPlanById(id);
    if (!plan) {
      res.status(404).json({ success: false, error: '方案不存在' });
      return;
    }
    if (!canModifyPlan(username, plan)) {
      res.status(403).json({ success: false, error: '无权删除此方案' });
      return;
    }
    const ok = deletePlan(id);
    res.json({ success: ok });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/plans/last-success', (req: Request, res: Response): void => {
  try {
    const username = _getUsername(req);
    const plan = getLastSuccessfulPlan(username);
    res.json({ success: true, data: plan });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/plans/export', (req: Request, res: Response): void => {
  try {
    const username = _getUsername(req);
    const data = exportPlans(username);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="takeover-plans-${Date.now()}.json"`);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/plans/import', (req: Request, res: Response): void => {
  try {
    const username = _getUsername(req);
    const result = importPlans(req.body, username);
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/ports/:port/check', async (req: Request, res: Response): Promise<void> => {
  try {
    const port = Number(req.params.port);
    const result = await getPortOccupier(port);
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

const executeSchema = z.object({
  action: z.enum(['launch', 'reuse', 'stop']),
});

router.post('/plans/:id/execute', async (req: Request, res: Response): Promise<void> => {
  try {
    const username = _getUsername(req);
    const id = Number(req.params.id);
    const plan = getPlanById(id);
    if (!plan) {
      res.status(404).json({ success: false, error: '方案不存在' });
      return;
    }
    const parsed = executeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues });
      return;
    }
    const result = await executeTakeover(plan, parsed.data.action as TakeoverAction, username);
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/receipts', (req: Request, res: Response): void => {
  try {
    const planId = req.query.planId ? Number(req.query.planId) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const records = listReceipts(planId, limit);
    res.json({ success: true, data: records });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/receipts/last', (req: Request, res: Response): void => {
  try {
    const username = _getUsername(req);
    const record = getLastReceipt(username);
    res.json({ success: true, data: record });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/receipts/:id', (req: Request, res: Response): void => {
  try {
    const id = Number(req.params.id);
    const record = getReceiptById(id);
    if (!record) {
      res.status(404).json({ success: false, error: '回执不存在' });
      return;
    }
    res.json({ success: true, data: record });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/receipts/undo-last', (req: Request, res: Response): void => {
  try {
    const username = _getUsername(req);
    const result = undoLastReceipt(username);
    if (!result) {
      res.status(400).json({ success: false, error: '没有可撤销的成功接管记录' });
      return;
    }
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
