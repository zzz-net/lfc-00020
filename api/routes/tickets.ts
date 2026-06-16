import { Router } from 'express';
import { ZodError } from 'zod';
import {
  addNoteSchema,
  assignTicketSchema,
  changeStatusSchema,
  createTicketSchema,
  undoSchema,
} from '../validators.js';
import {
  addNote,
  assignTicket,
  changeTicketStatus,
  createTicket,
  getNotesByTicket,
  getTicketById,
  getTickets,
  getUndoSnapshot,
  undoLastOperation,
} from '../services/tickets.js';
import { getAuditLogsByTicket } from '../services/audit.js';
import { checkTechnicianAvailability } from '../services/availability.js';
import type { TicketStatus } from '../../shared/types.js';

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

router.get('/', (req, res) => {
  try {
    const status = (req.query.status as string) || undefined;
    const validStatuses: TicketStatus[] = ['pending_assign', 'in_progress', 'pending_verify', 'closed'];
    if (status && !validStatuses.includes(status as TicketStatus)) {
      return res.status(400).json({ error: '无效的状态值' });
    }
    const tickets = getTickets(status as TicketStatus | undefined);
    res.json({ data: tickets });
  } catch (err) {
    _handleError(res, err);
  }
});

router.get('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的工单ID' });
    const ticket = getTicketById(id);
    if (!ticket) return res.status(404).json({ error: '工单不存在' });
    const notes = getNotesByTicket(id);
    const auditLogs = getAuditLogsByTicket(id);
    const undoSnapshot = getUndoSnapshot(id);
    res.json({ data: { ticket, notes, auditLogs, undoSnapshot } });
  } catch (err) {
    _handleError(res, err);
  }
});

router.post('/', (req, res) => {
  try {
    const parsed = createTicketSchema.parse(req.body) as any;
    const ticket = createTicket(parsed);
    res.status(201).json({ data: ticket });
  } catch (err) {
    _handleError(res, err);
  }
});

router.post('/:id/assign', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的工单ID' });
    const parsed = assignTicketSchema.parse(req.body) as any;
    const ticket = assignTicket(id, parsed.technicianId, parsed.operator);
    res.json({ data: ticket });
  } catch (err) {
    _handleError(res, err);
  }
});

router.patch('/:id/status', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的工单ID' });
    const parsed = changeStatusSchema.parse(req.body) as any;
    const ticket = changeTicketStatus(id, parsed.status, parsed.operator);
    res.json({ data: ticket });
  } catch (err) {
    _handleError(res, err);
  }
});

router.post('/:id/undo', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的工单ID' });
    const parsed = undoSchema.parse(req.body) as any;
    const ticket = undoLastOperation(id, parsed.operator);
    res.json({ data: ticket });
  } catch (err) {
    _handleError(res, err);
  }
});

router.post('/:id/notes', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的工单ID' });
    const parsed = addNoteSchema.parse(req.body) as any;
    const note = addNote(id, parsed.content, parsed.operator);
    res.status(201).json({ data: note });
  } catch (err) {
    _handleError(res, err);
  }
});

router.get('/:id/available-technicians', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效的工单ID' });
    const ticket = getTicketById(id);
    if (!ticket) return res.status(404).json({ error: '工单不存在' });
    const result = checkTechnicianAvailability({
      expectedDate: ticket.expectedDate,
      ticketId: id,
      title: ticket.title,
      description: ticket.description,
    });
    res.json({ data: result });
  } catch (err) {
    _handleError(res, err);
  }
});

export default router;
