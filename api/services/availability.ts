import type { Skill, TechnicianAvailability } from '../../shared/types.js';
import {
  getDailyAssignedCount,
  getTechnicians,
  getTechnicianById,
  isTechnicianOnVacation,
} from './technicians.js';
import { db } from '../db.js';
import { inferRequiredSkills } from './tickets.js';

export function checkTechnicianAvailability(params: {
  expectedDate: string;
  requiredSkills?: Skill[];
  ticketId?: number;
  title?: string;
  description?: string;
}): TechnicianAvailability[] {
  const technicians = getTechnicians();
  const required =
    params.requiredSkills && params.requiredSkills.length > 0
      ? params.requiredSkills
      : params.title || params.description
        ? inferRequiredSkills(params.title ?? '', params.description ?? '')
        : [];

  return technicians.map((tech) => {
    const reasons: string[] = [];

    const matchedSkills: Skill[] = [];
    const missingSkills: Skill[] = [];
    required.forEach((s) => {
      if (tech.skills.includes(s)) matchedSkills.push(s);
      else missingSkills.push(s);
    });
    const skillMatch = required.length === 0 || missingSkills.length === 0;
    if (!skillMatch) {
      reasons.push('技能不匹配');
    }

    const onVacation = isTechnicianOnVacation(tech.id, params.expectedDate);
    if (onVacation) reasons.push('该日期休假');

    const dailyAssignedCount = getDailyAssignedCount(tech.id, params.expectedDate);
    if (dailyAssignedCount >= tech.dailyLimit) {
      reasons.push(`当日已达接单上限（${dailyAssignedCount}/${tech.dailyLimit}）`);
    }

    let hasOverlap = false;
    const overlapRow = db
      .prepare(
        `SELECT 1 FROM tickets 
         WHERE technician_id = ? AND status != 'closed'
         AND expected_date = ? ${params.ticketId ? 'AND id != ?' : ''}
         LIMIT 1`,
      )
      .get(tech.id, params.expectedDate, ...(params.ticketId ? [params.ticketId] : []));
    if (overlapRow) {
      hasOverlap = true;
      reasons.push('同日期已有工单冲突');
    }

    return {
      technician: tech,
      available: reasons.length === 0,
      reasons,
      dailyAssignedCount,
      hasOverlap,
      onVacation,
      skillMatch,
      matchedSkills,
      missingSkills,
    };
  });
}

export { getTechnicianById };
