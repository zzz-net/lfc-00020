import { z } from 'zod';
import type { ExportBatchStatus, Skill, TicketStatus, Urgency } from '../shared/types.js';

export const SKILLS: Skill[] = [
  'air_conditioner',
  'refrigerator',
  'washing_machine',
  'computer',
  'network',
  'plumbing',
  'electrical',
  'elevator',
];

export const STATUSES: TicketStatus[] = ['pending_assign', 'in_progress', 'pending_verify', 'closed'];
export const URGENCIES: Urgency[] = ['low', 'medium', 'high', 'critical'];

export const createTicketSchema = z.object({
  title: z.string().min(1, '报修标题不能为空'),
  location: z.string().min(1, '地点不能为空'),
  description: z.string().min(1, '故障描述不能为空'),
  contactName: z.string().min(1, '联系人姓名不能为空'),
  contactPhone: z.string().min(1, '联系人电话不能为空').regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  urgency: z.enum(URGENCIES as [Urgency, ...Urgency[]]),
  expectedDate: z.string().min(1, '期望完成日期不能为空'),
  operator: z.string().min(1, '操作人不能为空'),
});

export const assignTicketSchema = z.object({
  technicianId: z.number().int().positive('技师ID无效'),
  operator: z.string().min(1, '操作人不能为空'),
});

export const changeStatusSchema = z.object({
  status: z.enum(STATUSES as [TicketStatus, ...TicketStatus[]]),
  operator: z.string().min(1, '操作人不能为空'),
});

export const addNoteSchema = z.object({
  content: z.string().min(1, '备注内容不能为空'),
  operator: z.string().min(1, '操作人不能为空'),
});

export const undoSchema = z.object({
  operator: z.string().min(1, '操作人不能为空'),
});

export const createTechnicianSchema = z.object({
  name: z.string().min(1, '姓名不能为空'),
  employeeId: z.string().min(1, '工号不能为空'),
  skills: z.array(z.enum(SKILLS as [Skill, ...Skill[]])).min(1, '至少选择一项技能'),
  dailyLimit: z.number().int().min(1, '每日接单上限至少为1'),
  operator: z.string().min(1, '操作人不能为空'),
});

export const updateTechnicianSchema = z.object({
  name: z.string().min(1, '姓名不能为空').optional(),
  skills: z.array(z.enum(SKILLS as [Skill, ...Skill[]])).min(1, '至少选择一项技能').optional(),
  dailyLimit: z.number().int().min(1, '每日接单上限至少为1').optional(),
  operator: z.string().min(1, '操作人不能为空'),
});

export const createVacationSchema = z.object({
  startDate: z.string().min(1, '开始日期不能为空'),
  endDate: z.string().min(1, '结束日期不能为空'),
  reason: z.string().optional(),
  operator: z.string().min(1, '操作人不能为空'),
});

export const availableTechniciansSchema = z.object({
  expectedDate: z.string().min(1, '期望日期不能为空'),
  requiredSkills: z.array(z.enum(SKILLS as [Skill, ...Skill[]])).optional(),
  ticketId: z.number().int().positive().optional(),
});

export const exportCsvSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  technicianId: z.coerce.number().int().positive().optional(),
});

export const reworkApplySchema = z.object({
  reason: z.string().min(5, '复核原因至少需要5个字符').max(500, '复核原因不能超过500个字符'),
  operator: z.string().min(1, '操作人不能为空'),
});

export const reworkWithdrawSchema = z.object({
  reworkId: z.number().int().positive('复核申请ID无效'),
  operator: z.string().min(1, '操作人不能为空'),
});

export const reworkReviewSchema = z.object({
  reworkId: z.number().int().positive('复核申请ID无效'),
  approved: z.boolean(),
  comment: z.string().min(2, '审批意见至少需要2个字符').max(500, '审批意见不能超过500个字符'),
  operator: z.string().min(1, '操作人不能为空'),
});

export const EXPORT_BATCH_STATUSES: ExportBatchStatus[] = ['pending', 'processing', 'completed', 'failed', 'cancelled'];

export const createExportBatchSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  technicianId: z.coerce.number().int().positive().optional(),
  status: z.enum(['pending_assign', 'in_progress', 'pending_verify', 'closed'] as [TicketStatus, ...TicketStatus[]]).optional(),
  operator: z.string().min(1, '操作人不能为空'),
});

export const cancelExportBatchSchema = z.object({
  operator: z.string().min(1, '操作人不能为空'),
});

export const listExportBatchesSchema = z.object({
  operator: z.string().optional(),
  status: z.enum([...EXPORT_BATCH_STATUSES] as [ExportBatchStatus, ...ExportBatchStatus[]]).optional(),
});
