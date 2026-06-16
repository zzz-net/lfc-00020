import type { Skill } from "../../shared/types";
import { SKILL_LABELS } from "../../shared/types";

const COLORS = [
  "bg-indigo-50 text-indigo-700 border-indigo-200",
  "bg-violet-50 text-violet-700 border-violet-200",
  "bg-teal-50 text-teal-700 border-teal-200",
  "bg-rose-50 text-rose-700 border-rose-200",
  "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  "bg-lime-50 text-lime-700 border-lime-200",
  "bg-cyan-50 text-cyan-700 border-cyan-200",
  "bg-amber-50 text-amber-700 border-amber-200",
];

const hashIndex = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % COLORS.length;
};

export default function SkillTag({ skill }: { skill: Skill }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${COLORS[hashIndex(skill)]}`}
    >
      {SKILL_LABELS[skill]}
    </span>
  );
}
