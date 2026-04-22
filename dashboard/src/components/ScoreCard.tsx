import { motion } from 'framer-motion';
import type { JudgmentFile, ModelId } from '../data/types';
import { MODEL_LABELS } from '../lib/matchup';

const AXES: Array<{ key: keyof JudgmentFile['scores'][ModelId]; label: string }> = [
  { key: 'realism', label: 'Realism' },
  { key: 'adherence', label: 'Adherence' },
  { key: 'detail', label: 'Detail' },
  { key: 'text', label: 'Text' },
  { key: 'overall', label: 'Overall' },
];

interface Props {
  judgment: JudgmentFile;
  revealed: boolean;
}

export function ScoreCard({ judgment, revealed }: Props) {
  const winner = judgment.winner;
  const winnerLabel =
    winner === 'tie' ? 'TIE' : MODEL_LABELS[winner].toUpperCase();

  return (
    <div className="flex flex-col gap-4">
      <motion.div
        initial={false}
        animate={{ opacity: revealed ? 1 : 0.35 }}
        transition={{ duration: 0.35 }}
        className="grid grid-cols-5 gap-3"
      >
        {AXES.map(({ key, label }, i) => {
          const gpt = judgment.scores['gpt-image-2'][key];
          const nano = judgment.scores['nano-banana-2'][key];
          return (
            <motion.div
              key={key}
              initial={{ y: 12, opacity: 0 }}
              animate={
                revealed ? { y: 0, opacity: 1 } : { y: 12, opacity: 0 }
              }
              transition={{ delay: i * 0.08, type: 'spring', stiffness: 180, damping: 18 }}
              className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-ink-900/60 p-4"
            >
              <div className="text-xs uppercase tracking-[0.18em] text-ink-300">{label}</div>
              <div className="flex items-baseline gap-2 font-mono text-2xl font-semibold">
                <span className={gpt === null ? 'text-ink-500' : 'text-emerald-300'}>
                  {gpt ?? '—'}
                </span>
                <span className="text-xs text-ink-500">vs</span>
                <span className={nano === null ? 'text-ink-500' : 'text-sky-300'}>
                  {nano ?? '—'}
                </span>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      <motion.div
        initial={false}
        animate={{
          opacity: revealed ? 1 : 0,
          scale: revealed ? 1 : 0.94,
        }}
        transition={{ delay: revealed ? 0.55 : 0, type: 'spring', stiffness: 220, damping: 22 }}
        className="flex flex-col items-center gap-3 rounded-2xl border border-win/30 bg-gradient-to-br from-amber-500/15 to-amber-500/5 py-5"
      >
        <div className="text-xs uppercase tracking-[0.32em] text-amber-200/80">
          Winner
        </div>
        <div className="font-mono text-3xl font-bold text-amber-200">
          {winnerLabel}
        </div>
        <div className="max-w-3xl px-6 text-center text-sm text-ink-200">
          {judgment.verdict}
        </div>
      </motion.div>
    </div>
  );
}
