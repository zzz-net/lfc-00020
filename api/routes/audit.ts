import { Router } from 'express';
import { getAllAuditLogs } from '../services/audit.js';

const router = Router();

router.get('/', (_req, res) => {
  try {
    const logs = getAllAuditLogs(500);
    res.json({ data: logs });
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
