import { motion } from 'framer-motion';
import type { JudgmentFile, Matchup, ModelId } from '../data/types';
import { CATEGORY_LABELS, MODEL_LABELS, buildLeaderboard, buildOverall } from '../lib/matchup';
import { KeyboardHint } from '../components/KeyboardHint';

interface Props {
  matchups: Matchup[];
  judgments: Record<string, JudgmentFile>;
}

function WinCell({
  count,
  total,
  tone,
}: {
  count: number;
  total: number;
  tone: 'gpt' | 'nano' | 'tie';
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const bar =
    tone === 'gpt'
      ? 'bg-emerald-400/70'
      : tone === 'nano'
        ? 'bg-sky-400/70'
        : 'bg-amber-300/70';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2 font-mono">
        <span className="text-xl font-bold text-ink-100">{count}</span>
        <span className="text-xs text-ink-400">/ {total}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <motion.div
          className={`h-full ${bar}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

export function Leaderboard({ matchups, judgments }: Props) {
  const rows = buildLeaderboard(matchups, judgments);
  const overall = buildOverall(matchups, judgments);
  const leader = decideLeader(overall.wins);

  return (
    <div className="grid-bg slide-glow relative flex min-h-screen w-screen flex-col overflow-hidden">
      <div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-col gap-12 px-16 py-14">
        {/* Title */}
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.32em] text-ink-300">
              Final tally · {overall.totalJudged} judged
            </div>
            <h2 className="mt-3 text-5xl font-bold tracking-tight text-white">
              Who wins what
            </h2>
          </div>
          <OverallBadge leader={leader} />
        </div>

        {/* Category grid */}
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="grid grid-cols-[2fr_repeat(3,1fr)_1.2fr] items-center gap-6 border-b border-white/10 px-6 py-4 text-xs uppercase tracking-[0.22em] text-ink-400">
            <div>Category</div>
            <div className="text-emerald-300">GPT Image 2</div>
            <div className="text-sky-300">Nano Banana 2</div>
            <div className="text-amber-200">Ties</div>
            <div className="text-right">Winner</div>
          </div>
          {rows.map((row, i) => {
            const winner = categoryWinner(row.wins);
            return (
              <motion.div
                key={row.category}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.4 }}
                className="grid grid-cols-[2fr_repeat(3,1fr)_1.2fr] items-center gap-6 border-t border-white/5 px-6 py-5"
              >
                <div>
                  <div className="font-semibold text-ink-100">
                    {CATEGORY_LABELS[row.category]}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
                    {row.judged}/{row.total} judged
                  </div>
                </div>
                <WinCell count={row.wins['gpt-image-2']} total={row.judged} tone="gpt" />
                <WinCell count={row.wins['nano-banana-2']} total={row.judged} tone="nano" />
                <WinCell count={row.wins.tie} total={row.judged} tone="tie" />
                <div className="text-right font-mono text-sm font-semibold">
                  {winner === 'tie' ? (
                    <span className="text-amber-200">TIE</span>
                  ) : winner ? (
                    <span
                      className={
                        winner === 'gpt-image-2' ? 'text-emerald-300' : 'text-sky-300'
                      }
                    >
                      {MODEL_LABELS[winner]}
                    </span>
                  ) : (
                    <span className="text-ink-500">—</span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Speed + overall */}
        <div className="grid grid-cols-2 gap-6">
          <SpeedCard
            label="Avg generation time · GPT Image 2"
            ms={overall.avgCostTimeMs['gpt-image-2']}
            accent="text-emerald-300"
          />
          <SpeedCard
            label="Avg generation time · Nano Banana 2"
            ms={overall.avgCostTimeMs['nano-banana-2']}
            accent="text-sky-300"
          />
        </div>

        {/* Pricing */}
        <PriceBreakdown />
      </div>

      <KeyboardHint
        hints={[
          { keys: ['1'], label: 'Intro' },
          { keys: ['2'], label: 'Deck' },
          { keys: ['F'], label: 'Fullscreen' },
        ]}
      />
    </div>
  );
}

function decideLeader(wins: Record<ModelId | 'tie', number>): ModelId | 'tie' | null {
  const gpt = wins['gpt-image-2'];
  const nano = wins['nano-banana-2'];
  if (gpt === 0 && nano === 0 && wins.tie === 0) return null;
  if (gpt > nano) return 'gpt-image-2';
  if (nano > gpt) return 'nano-banana-2';
  return 'tie';
}

function categoryWinner(
  wins: Record<ModelId | 'tie', number>,
): ModelId | 'tie' | null {
  const entries: Array<[ModelId | 'tie', number]> = [
    ['gpt-image-2', wins['gpt-image-2']],
    ['nano-banana-2', wins['nano-banana-2']],
    ['tie', wins.tie],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  const [top, second] = entries;
  if (!top || top[1] === 0) return null;
  if (second && top[1] === second[1]) return 'tie';
  return top[0];
}

function OverallBadge({ leader }: { leader: ModelId | 'tie' | null }) {
  if (!leader) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-8 py-5 text-right">
        <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-ink-400">
          Nothing judged yet
        </div>
      </div>
    );
  }
  const label = leader === 'tie' ? 'OVERALL TIE' : MODEL_LABELS[leader].toUpperCase();
  const tone =
    leader === 'gpt-image-2'
      ? 'text-emerald-300 from-emerald-400/15'
      : leader === 'nano-banana-2'
        ? 'text-sky-300 from-sky-400/15'
        : 'text-amber-200 from-amber-300/15';
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 180, damping: 18 }}
      className={`flex flex-col items-end gap-1 rounded-2xl border border-white/10 bg-gradient-to-br to-transparent px-8 py-5 ${tone}`}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-ink-300">
        Overall winner
      </div>
      <div className="font-mono text-3xl font-bold">{label}</div>
    </motion.div>
  );
}

function PriceBreakdown() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-8 py-7">
      <div className="flex items-baseline justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink-400">
          Price per image · via kie.ai
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-500">
          This run used Nano @ 2K
        </div>
      </div>
      <div className="mt-6 grid grid-cols-[1fr_1.6fr] gap-8">
        {/* GPT Image 2 — flat price */}
        <div className="flex flex-col justify-between rounded-xl border border-emerald-400/15 bg-emerald-400/5 px-6 py-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.26em] text-emerald-300">
            GPT Image 2
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-mono text-5xl font-bold text-emerald-200">6¢</span>
            <span className="font-mono text-xs text-ink-400">per image</span>
          </div>
          <div className="mt-3 font-mono text-[11px] text-ink-500">
            Flat rate · resolution fixed
          </div>
        </div>

        {/* Nano Banana 2 — tiered */}
        <div className="flex flex-col rounded-xl border border-sky-400/15 bg-sky-400/5 px-6 py-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.26em] text-sky-300">
            Nano Banana 2
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <PriceTier resolution="1K" price="4¢" highlighted={false} />
            <PriceTier resolution="2K" price="6¢" highlighted={true} />
            <PriceTier resolution="4K" price="9¢" highlighted={false} />
          </div>
          <div className="mt-3 font-mono text-[11px] text-ink-500">
            Pick resolution per request
          </div>
        </div>
      </div>
    </div>
  );
}

function PriceTier({
  resolution,
  price,
  highlighted,
}: {
  resolution: string;
  price: string;
  highlighted: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-lg px-3 py-3 ${
        highlighted
          ? 'border border-sky-300/40 bg-sky-300/10'
          : 'border border-white/5 bg-white/[0.02]'
      }`}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-400">
        {resolution}
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={`font-mono text-3xl font-bold ${
            highlighted ? 'text-sky-200' : 'text-ink-200'
          }`}
        >
          {price}
        </span>
      </div>
    </div>
  );
}

function SpeedCard({
  label,
  ms,
  accent,
}: {
  label: string;
  ms: number | null;
  accent: string;
}) {
  const value = ms === null ? '—' : `${(ms / 1000).toFixed(2)}s`;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink-400">
        {label}
      </div>
      <div className={`mt-2 font-mono text-4xl font-bold ${accent}`}>{value}</div>
    </div>
  );
}
