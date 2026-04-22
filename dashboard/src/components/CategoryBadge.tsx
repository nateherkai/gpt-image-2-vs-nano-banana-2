import type { Category } from '../data/types';
import { CATEGORY_LABELS } from '../lib/matchup';

const CATEGORY_COLORS: Record<Category, string> = {
  'text-typography': 'from-amber-400/20 to-amber-600/10 text-amber-200 ring-amber-400/40',
  portraits: 'from-rose-400/20 to-rose-600/10 text-rose-200 ring-rose-400/40',
  'complex-scenes': 'from-indigo-400/20 to-indigo-600/10 text-indigo-200 ring-indigo-400/40',
  product: 'from-emerald-400/20 to-emerald-600/10 text-emerald-200 ring-emerald-400/40',
  'diagrams-ui': 'from-cyan-400/20 to-cyan-600/10 text-cyan-200 ring-cyan-400/40',
  artistic: 'from-fuchsia-400/20 to-fuchsia-600/10 text-fuchsia-200 ring-fuchsia-400/40',
  'style-transfer': 'from-violet-400/20 to-violet-600/10 text-violet-200 ring-violet-400/40',
  'character-consistency': 'from-sky-400/20 to-sky-600/10 text-sky-200 ring-sky-400/40',
  'object-edit': 'from-teal-400/20 to-teal-600/10 text-teal-200 ring-teal-400/40',
  'photo-enhance': 'from-orange-400/20 to-orange-600/10 text-orange-200 ring-orange-400/40',
};

export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] ring-1 ring-inset ${CATEGORY_COLORS[category]}`}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}
