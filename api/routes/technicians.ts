import { Router } from 'express';
import { ZodError } from 'zod';
import {
  createTechnicianSchema,
  createVacationSchema,
  updateTechnicianSchema,
} from '../validators.js';
import {
  createTechnician,
  createVacation,
  deleteTechnician,
  getTechnicians,
  getTechnicianById,
  getVacationsByTechnician,
  updateTechnician,
} from '../services/technicians.js';

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

router.get('/', (_req, res) => {
  try {
    const techs = getTechnicians();
    res.json({ data: techs });
  } catch (err) {
    _handleError(res, err);
  }
});

router.get('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的技师ID' });
    const tech = getTechnicianById(id);
    if (!tech) return res.status(404).json({ error: '技师不存在' });
    const vacations = getVacationsByTechnician(id);
    res.json({ data: { technician: tech, vacations } });
  } catch (err) {
    _handleError(res, err);
  }
});

router.post('/', (req, res) => {
  try {
    const parsed = createTechnicianSchema.parse(req.body);
    const tech = createTechnician(parsed as any);
    res.status(201).json({ data: tech });
  } catch (err) {
    _handleError(res, err);
  }
});

router.patch('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的技师ID' });
    const parsed = updateTechnicianSchema.parse(req.body);
    const tech = updateTechnician(id, parsed as any);
    res.json({ data: tech });
  } catch (err) {
    _handleError(res, err);
  }
});

router.delete('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的技师ID' });
    const operator = (req.query.operator as string) || 'system';
    deleteTechnician(id, operator);
    res.json({ data: { ok: true } });
  } catch (err) {
    _handleError(res, err);
  }
});

router.get('/:id/vacations', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的技师ID' });
    const vacations = getVacationsByTechnician(id);
    res.json({ data: vacations });
  } catch (err) {
    _handleError(res, err);
  }
});

router.post('/:id/vacations', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的技师ID' });
    const parsed = createVacationSchema.parse(req.body) as any;
    const vacation = createVacation({ ...parsed, technicianId: id });
    res.status(201).json({ data: vacation });
  } catch (err) {
    _handleError(res, err);
  }
});

export default router;
