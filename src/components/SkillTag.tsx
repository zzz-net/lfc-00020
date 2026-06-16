import { SKILL_LABELS, type Skill } from '@shared/types';

const skillColors: Record<string, string> = {
  air_conditioner: 'bg-sky-100 text-sky-700',
  refrigerator: 'bg-cyan-100 text-cyan-700',
  washing_machine: 'bg-teal-100 text-teal-700',
  computer: 'bg-indigo-100 text-indigo-700',
  network: 'bg-violet-100 text-violet-700',
  plumbing: 'bg-emerald-100 text-emerald-700',
  electrical: 'bg-amber-100 text-amber-700',
  elevator: 'bg-rose-100 text-rose-700',
};

export default function SkillTag({ skill }: { skill: Skill }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${skillColors[skill] || 'bg-slate-100 text-slate-700'}`}
    >
      {SKILL_LABELS[skill]}
    </span>
  );
}
