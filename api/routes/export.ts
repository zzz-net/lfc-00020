import { Router } from 'express';
import { ZodError } from 'zod';
import fs from 'fs';
import {
  cancelExportBatchSchema,
  createExportBatchSchema,
  exportCsvSchema,
  listExportBatchesSchema,
} from '../validators.js';
import { generateCsv } from '../services/exportCsv.js';
import {
  cancelExportBatch,
  createExportBatch,
  getBatchSnapshotsWithDiff,
  getExportBatchById,
  getExportFilePath,
  listExportBatches,
  retryExportBatch,
} from '../services/exportBatch.js';

const router = Router();

function _handleError(res: any, err: unknown) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.errors.map((e) => e.message).join('；') });
  }
  if (err instanceof Error) {
    return res.status(400).json({ error: err.message });
  }
  return res.status(500).json({ error: 'Internal error' });
}

router.get('/csv', (req, res) => {
  try {
    const parsed = exportCsvSchema.parse(req.query) as any;
    const { filename, content } = generateCsv(parsed);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (err) {
    _handleError(res, err);
  }
});

router.post('/batches', (req, res) => {
  try {
    const parsed = createExportBatchSchema.parse(req.body) as any;
    const { operator, startDate, endDate, technicianId, status } = parsed;
    const batch = createExportBatch({
      operator,
      filters: { startDate, endDate, technicianId, status },
    });
    res.status(201).json({ data: batch });
  } catch (err) {
    _handleError(res, err);
  }
});

router.get('/batches', (req, res) => {
  try {
    const parsed = listExportBatchesSchema.parse(req.query) as any;
    const operator = (req.query.operator as string) || '';
    if (!operator) return res.status(400).json({ error: '操作人不能为空' });
    const batches = listExportBatches({ operator, status: parsed.status });
    res.json({ data: batches });
  } catch (err) {
    _handleError(res, err);
  }
});

router.get('/batches/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的批次ID' });
    const operator = (req.query.operator as string) || '';
    if (!operator) return res.status(400).json({ error: '操作人不能为空' });
    const batch = getExportBatchById(id, operator);
    if (!batch) return res.status(404).json({ error: '导出批次不存在' });
    res.json({ data: batch });
  } catch (err) {
    _handleError(res, err);
  }
});

router.get('/batches/:id/snapshots', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的批次ID' });
    const operator = (req.query.operator as string) || '';
    if (!operator) return res.status(400).json({ error: '操作人不能为空' });
    const snapshots = getBatchSnapshotsWithDiff(id, operator);
    res.json({ data: snapshots });
  } catch (err) {
    _handleError(res, err);
  }
});

router.post('/batches/:id/cancel', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的批次ID' });
    const parsed = cancelExportBatchSchema.parse(req.body) as any;
    const batch = cancelExportBatch(id, parsed.operator);
    res.json({ data: batch });
  } catch (err) {
    _handleError(res, err);
  }
});

router.post('/batches/:id/retry', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的批次ID' });
    const parsed = cancelExportBatchSchema.parse(req.body) as any;
    const batch = retryExportBatch(id, parsed.operator);
    res.status(201).json({ data: batch });
  } catch (err) {
    _handleError(res, err);
  }
});

router.get('/batches/:id/download', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的批次ID' });
    const operator = (req.query.operator as string) || '';
    if (!operator) return res.status(400).json({ error: '操作人不能为空' });
    const { path: filePath, fileName } = getExportFilePath(id, operator);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    _handleError(res, err);
  }
});

export default router;
