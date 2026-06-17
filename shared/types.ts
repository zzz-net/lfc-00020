export type TicketStatus = 'pending_assign' | 'in_progress' | 'pending_verify' | 'closed';

export type ReworkStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export type ExportBatchStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type Urgency = 'low' | 'medium' | 'high' | 'critical';

export type Skill =
  | 'air_conditioner'
  | 'refrigerator'
  | 'washing_machine'
  | 'computer'
  | 'network'
  | 'plumbing'
  | 'electrical'
  | 'elevator';

export type AuditAction =
  | 'create'
  | 'assign'
  | 'status_change'
  | 'undo'
  | 'note_add'
  | 'technician_create'
  | 'technician_update'
  | 'technician_delete'
  | 'vacation_create'
  | 'rework_apply'
  | 'rework_withdraw'
  | 'rework_approve'
  | 'rework_reject'
  | 'rework_status_rollback'
  | 'export_create'
  | 'export_cancel'
  | 'export_retry'
  | 'export_complete'
  | 'export_fail'
  | 'export_recover';

export interface Technician {
  id: number;
  name: string;
  employeeId: string;
  skills: Skill[];
  dailyLimit: number;
  createdAt: string;
}

export interface Vacation {
  id: number;
  technicianId: number;
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface Ticket {
  id: number;
  ticketNo: string;
  title: string;
  location: string;
  description: string;
  contactName: string;
  contactPhone: string;
  urgency: Urgency;
  expectedDate: string;
  status: TicketStatus;
  technicianId?: number;
  technicianName?: string;
  assignedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: number;
  ticketId: number;
  operator: string;
  content: string;
  createdAt: string;
}

export interface AuditLog {
  id: number;
  ticketId?: number;
  operator: string;
  action: AuditAction;
  beforeData?: string;
  afterData?: string;
  description: string;
  createdAt: string;
  undoOfId?: number;
}

export interface OperationSnapshot {
  id: number;
  ticketId: number;
  auditLogId: number;
  previousStatus: TicketStatus;
  previousTechnicianId?: number;
}

export interface TechnicianAvailability {
  technician: Technician;
  available: boolean;
  reasons: string[];
  dailyAssignedCount: number;
  hasOverlap: boolean;
  onVacation: boolean;
  skillMatch: boolean;
  matchedSkills: Skill[];
  missingSkills: Skill[];
}

export interface ReworkApplication {
  id: number;
  ticketId: number;
  applicant: string;
  reason: string;
  status: ReworkStatus;
  reviewer?: string;
  reviewComment?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const SKILL_LABELS: Record<Skill, string> = {
  air_conditioner: '空调维修',
  refrigerator: '冰箱维修',
  washing_machine: '洗衣机维修',
  computer: '电脑维修',
  network: '网络维护',
  plumbing: '水管维修',
  electrical: '电工维修',
  elevator: '电梯维修',
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  pending_assign: '待派单',
  in_progress: '处理中',
  pending_verify: '待验收',
  closed: '已关闭',
};

export const URGENCY_LABELS: Record<Urgency, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '紧急',
};

export const REWORK_STATUS_LABELS: Record<ReworkStatus, string> = {
  pending: '待审批',
  approved: '已通过',
  rejected: '已拒绝',
  withdrawn: '已撤回',
};

export const REWORK_STATUS_COLORS: Record<ReworkStatus, string> = {
  pending: 'amber',
  approved: 'emerald',
  rejected: 'red',
  withdrawn: 'slate',
};

export const TICKET_REQUIRED_SKILLS_MAP: Record<string, Skill[]> = {
  空调: ['air_conditioner'],
  制冷: ['air_conditioner'],
  冰箱: ['refrigerator'],
  洗衣机: ['washing_machine'],
  电脑: ['computer'],
  网络: ['network'],
  上网: ['network'],
  WiFi: ['network'],
  水管: ['plumbing'],
  漏水: ['plumbing'],
  下水: ['plumbing'],
  电: ['electrical'],
  电路: ['electrical'],
  插座: ['electrical'],
  电梯: ['elevator'],
};

export const EXPORT_BATCH_STATUS_LABELS: Record<ExportBatchStatus, string> = {
  pending: '等待生成',
  processing: '生成中',
  completed: '已完成',
  failed: '生成失败',
  cancelled: '已取消',
};

export const EXPORT_BATCH_STATUS_COLORS: Record<ExportBatchStatus, string> = {
  pending: 'slate',
  processing: 'amber',
  completed: 'emerald',
  failed: 'red',
  cancelled: 'slate',
};

export interface ExportFilters {
  startDate?: string;
  endDate?: string;
  technicianId?: number;
  status?: TicketStatus;
}

export interface TicketSnapshot {
  ticketId: number;
  ticketNo: string;
  title: string;
  location: string;
  description: string;
  contactName: string;
  contactPhone: string;
  urgency: Urgency;
  expectedDate: string;
  status: TicketStatus;
  technicianId?: number;
  technicianName?: string;
  assignedAt?: string;
  createdAt: string;
  updatedAt: string;
  reworkStatus?: ReworkStatus;
  reworkApplicant?: string;
  reworkReason?: string;
  reworkReviewer?: string;
  reworkComment?: string;
  reworkCreatedAt?: string;
  reviewedAt?: string;
  hasStatusDiff?: boolean;
  hasTechnicianDiff?: boolean;
  currentStatus?: TicketStatus;
  currentTechnicianName?: string;
}

export type VerificationStatus = 'pending' | 'verified' | 'mismatch';

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  pending: '待验真',
  verified: '验真通过',
  mismatch: '验真不通过',
};

export const VERIFICATION_STATUS_COLORS: Record<VerificationStatus, string> = {
  pending: 'slate',
  verified: 'emerald',
  mismatch: 'red',
};

export interface ExportVerificationDetail {
  snapshotCount: number;
  fileRowCount: number;
  fileSizeBytes: number;
  fileSha256: string;
  countMatch: boolean;
  fileExists: boolean;
  verifiedAt?: string;
  mismatchReason?: string;
}

export interface ExportBatch {
  id: number;
  batchNo: string;
  operator: string;
  filters: ExportFilters;
  filterSummary: string;
  ticketIds: number[];
  status: ExportBatchStatus;
  totalCount: number;
  exportedCount: number;
  failedReason?: string;
  filePath?: string;
  fileName?: string;
  fileSha256?: string;
  fileSizeBytes?: number;
  fileRowCount?: number;
  verificationStatus?: VerificationStatus;
  verificationDetail?: ExportVerificationDetail;
  retryOfId?: number;
  retryChain?: ExportBatch[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  recoveredAt?: string;
}
