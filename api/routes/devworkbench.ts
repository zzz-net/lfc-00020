import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import {
  listConfigs,
  getConfigById,
  createConfig,
  updateConfig,
  deleteConfig,
  checkPort,
  launchAndVerify,
  stopService,
  getRunningPids,
  listVerifications,
  getVerificationById,
  getLastSuccessfulConfig,
  isAdmin,
  canModifyConfig,
  getUserByUsername,
  listUsers,
} from '../services/devworkbench.js';

const router = express.Router();

function _getUsername(req: Request): string {
  return (req.headers['x-username'] as string) || 'admin';
}

router.get('/users', (req: Request, res: Response): void => {
  try {
    const username = _getUsername(req);
    if (!isAdmin(username)) {
      res.status(403).json({ success: false, error: '无权限访问' });
      return;
    }
    const users = listUsers();
    res.json({ success: true, data: users });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/users/me', (req: Request, res: Response): void => {
  try {
    const username = _getUsername(req);
    const user = getUserByUsername(username);
    if (!user) {
      res.status(404).json({ success: false, error: '用户不存在' });
      return;
    }
    res.json({ success: true, data: user });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/configs', (req: Request, res: Response): void => {
  try {
    const username = _getUsername(req);
    const configs = listConfigs(username);
    res.json({ success: true, data: configs });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

const createConfigSchema = z.object({
  name: z.string().min(1),
  scope: z.enum(['public', 'private']),
  serviceType: z.enum(['frontend', 'backend']),
  command: z.string().min(1),
  cwd: z.string().min(1),
  fixedPort: z.number().int().min(1).max(65535),
  healthCheckUrl: z.string().url(),
  startupTimeoutSec: z.number().int().min(5).max(600),
  ownerUsername: z.string().optional(),
});

router.post('/configs', (req: Request, res: Response): void => {
  try {
    const username = _getUsername(req);
    const parsed = createConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues });
      return;
    }
    const data = parsed.data;
    const owner = data.ownerUsername || username;
    if (data.scope === 'public' && !isAdmin(username)) {
      res.status(403).json({ success: false, error: '仅管理员可创建公共配置' });
      return;
    }
    if (owner !== username && !isAdmin(username)) {
      res.status(403).json({ success: false, error: '无权为他人创建配置' });
      return;
    }
    const config = createConfig({
      name: data.name,
      scope: data.scope,
      serviceType: data.serviceType,
      command: data.command,
      cwd: data.cwd,
      fixedPort: data.fixedPort,
      healthCheckUrl: data.healthCheckUrl,
      startupTimeoutSec: data.startupTimeoutSec,
      ownerUsername: owner,
    });
    res.status(201).json({ success: true, data: config });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

const updateConfigSchema = z.object({
  name: z.string().min(1).optional(),
  scope: z.enum(['public', 'private']).optional(),
  serviceType: z.enum(['frontend', 'backend']).optional(),
  command: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  fixedPort: z.number().int().min(1).max(65535).optional(),
  healthCheckUrl: z.string().url().optional(),
  startupTimeoutSec: z.number().int().min(5).max(600).optional(),
});

router.put('/configs/:id', (req: Request, res: Response): void => {
  try {
    const username = _getUsername(req);
    const id = Number(req.params.id);
    const config = getConfigById(id);
    if (!config) {
      res.status(404).json({ success: false, error: '配置不存在' });
      return;
    }
    if (!canModifyConfig(username, config)) {
      res.status(403).json({ success: false, error: '无权修改此配置' });
      return;
    }
    const parsed = updateConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues });
      return;
    }
    const data = parsed.data;
    if (data.scope === 'public' && !isAdmin(username)) {
      res.status(403).json({ success: false, error: '仅管理员可设置公共配置' });
      return;
    }
    const updated = updateConfig(id, data);
    res.json({ success: true, data: updated });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/configs/:id', (req: Request, res: Response): void => {
  try {
    const username = _getUsername(req);
    const id = Number(req.params.id);
    const config = getConfigById(id);
    if (!config) {
      res.status(404).json({ success: false, error: '配置不存在' });
      return;
    }
    if (!canModifyConfig(username, config)) {
      res.status(403).json({ success: false, error: '无权删除此配置' });
      return;
    }
    const ok = deleteConfig(id);
    res.json({ success: ok });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/configs/last-success', (req: Request, res: Response): void => {
  try {
    const username = _getUsername(req);
    const serviceType = req.query.serviceType as 'frontend' | 'backend' | undefined;
    const config = getLastSuccessfulConfig(username, serviceType);
    res.json({ success: true, data: config });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/ports/:port/check', async (req: Request, res: Response): Promise<void> => {
  try {
    const port = Number(req.params.port);
    const result = await checkPort(port);
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/configs/:id/launch', async (req: Request, res: Response): Promise<void> => {
  try {
    const username = _getUsername(req);
    const id = Number(req.params.id);
    const config = getConfigById(id);
    if (!config) {
      res.status(404).json({ success: false, error: '配置不存在' });
      return;
    }
    const result = await launchAndVerify(config, username);
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/processes/:pid/stop', (req: Request, res: Response): void => {
  try {
    const username = _getUsername(req);
    if (!isAdmin(username)) {
      res.status(403).json({ success: false, error: '仅管理员可停止进程' });
      return;
    }
    const pid = Number(req.params.pid);
    const ok = stopService(pid);
    res.json({ success: ok });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/processes', (req: Request, res: Response): void => {
  try {
    const username = _getUsername(req);
    if (!isAdmin(username)) {
      res.status(403).json({ success: false, error: '无权限访问' });
      return;
    }
    const pids = getRunningPids();
    res.json({ success: true, data: pids });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/verifications', (req: Request, res: Response): void => {
  try {
    const configId = req.query.configId ? Number(req.query.configId) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const records = listVerifications(configId, limit);
    res.json({ success: true, data: records });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/verifications/:id', (req: Request, res: Response): void => {
  try {
    const id = Number(req.params.id);
    const record = getVerificationById(id);
    if (!record) {
      res.status(404).json({ success: false, error: '记录不存在' });
      return;
    }
    res.json({ success: true, data: record });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
