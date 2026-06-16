import { Router } from 'express';
import { ZodError } from 'zod';
import { exportCsvSchema } from '../validators.js';
import { generateCsv } from '../services/exportCsv.js';

const router = Router();

router.get('/csv', (req, res) => {
  try {
    const parsed = exportCsvSchema.parse(req.query) as any;
    const { filename, content } = generateCsv(parsed);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.errors.map((e) => e.message).join('；') });
    }
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
