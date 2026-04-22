import type { Category, JudgmentFile, Matchup, ModelId } from '../data/types';

export const CATEGORY_LABELS: Record<Category, string> = {
  'text-typography': 'Text & Typography',
  portraits: 'Photorealistic Portraits',
  'complex-scenes': 'Complex Scenes',
  product: 'Product Photography',
  'diagrams-ui': 'Diagrams & UI',
  artistic: 'Artistic Styles',
  'style-transfer': 'Style Transfer',
  'character-consistency': 'Character Consistency',
  'object-edit': 'Object Editing',
  'photo-enhance': 'Photo Enhancement',
};

export const MODEL_LABELS: Record<ModelId, string> = {
  'gpt-image-2': 'GPT Image 2',
  'nano-banana-2': 'Nano Banana 2',
};

/**
 * Parse `text-typography__02-infographic-chart` into variation letter + slug.
 * Returns { variation: 'B', slug: 'infographic-chart' }.
 */
export function parseMatchupId(id: string): { variation: string; slug: string } {
  const [, suffix = ''] = id.split('__');
  const match = suffix.match(/^(\d+)-(.*)$/);
  if (!match) return { variation: '?', slug: suffix };
  const n = Number.parseInt(match[1] ?? '0', 10);
  const letter = String.fromCharCode(64 + n); // 1 → A, 2 → B, 3 → C
  return { variation: letter, slug: match[2] ?? '' };
}

export interface LeaderboardRow {
  category: Category;
  total: number;
  judged: number;
  wins: Record<ModelId | 'tie', number>;
}

export function buildLeaderboard(
  matchups: Matchup[],
  judgments: Record<string, JudgmentFile>,
): LeaderboardRow[] {
  const byCat = new Map<Category, Matchup[]>();
  for (const m of matchups) {
    const arr = byCat.get(m.category) ?? [];
    arr.push(m);
    byCat.set(m.category, arr);
  }
  const rows: LeaderboardRow[] = [];
  for (const [category, list] of byCat) {
    const wins: LeaderboardRow['wins'] = {
      'gpt-image-2': 0,
      'nano-banana-2': 0,
      tie: 0,
    };
    let judged = 0;
    for (const m of list) {
      const j = judgments[m.id];
      if (!j) continue;
      judged += 1;
      wins[j.winner] += 1;
    }
    rows.push({ category, total: list.length, judged, wins });
  }
  rows.sort((a, b) => a.category.localeCompare(b.category));
  return rows;
}

export interface OverallTally {
  wins: Record<ModelId | 'tie', number>;
  avgCostTimeMs: Record<ModelId, number | null>;
  totalJudged: number;
}

export function buildOverall(
  matchups: Matchup[],
  judgments: Record<string, JudgmentFile>,
): OverallTally {
  const wins: OverallTally['wins'] = {
    'gpt-image-2': 0,
    'nano-banana-2': 0,
    tie: 0,
  };
  const timeTotals: Record<ModelId, { sum: number; n: number }> = {
    'gpt-image-2': { sum: 0, n: 0 },
    'nano-banana-2': { sum: 0, n: 0 },
  };
  let totalJudged = 0;
  for (const m of matchups) {
    for (const modelId of ['gpt-image-2', 'nano-banana-2'] as ModelId[]) {
      const ct = m.models[modelId].costTimeMs;
      if (typeof ct === 'number') {
        timeTotals[modelId].sum += ct;
        timeTotals[modelId].n += 1;
      }
    }
    const j = judgments[m.id];
    if (!j) continue;
    totalJudged += 1;
    wins[j.winner] += 1;
  }
  const avg = (t: { sum: number; n: number }) => (t.n > 0 ? t.sum / t.n : null);
  return {
    wins,
    avgCostTimeMs: {
      'gpt-image-2': avg(timeTotals['gpt-image-2']),
      'nano-banana-2': avg(timeTotals['nano-banana-2']),
    },
    totalJudged,
  };
}
