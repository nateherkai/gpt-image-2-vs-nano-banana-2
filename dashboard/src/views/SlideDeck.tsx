import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { JudgmentFile, Matchup } from '../data/types';
import { CategoryBadge } from '../components/CategoryBadge';
import { ImagePair } from '../components/ImagePair';
import { ScoreCard } from '../components/ScoreCard';
import { KeyboardHint } from '../components/KeyboardHint';
import { parseMatchupId } from '../lib/matchup';

interface Props {
  runId: string;
  matchups: Matchup[];
  judgments: Record<string, JudgmentFile>;
}

export function SlideDeck({ runId, matchups, judgments }: Props) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const total = matchups.length;

  const next = useCallback(() => {
    setIndex((i) => Math.min(total - 1, i + 1));
    setRevealed(false);
  }, [total]);

  const prev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
    setRevealed(false);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.key.toLowerCase() === 'r') {
        setRevealed((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next, prev]);

  if (total === 0) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-ink-300">No matchups in this run.</div>
      </div>
    );
  }

  const m = matchups[index]!;
  const judgment = judgments[m.id];
  const { variation } = parseMatchupId(m.id);
  const position = index + 1;

  return (
    <div className="grid-bg slide-glow relative flex h-screen w-screen flex-col overflow-hidden">
      {/* Progress bar */}
      <div className="absolute left-0 top-0 z-20 h-1 w-full bg-white/5">
        <motion.div
          className="h-full bg-gradient-to-r from-emerald-400 via-sky-400 to-amber-300"
          animate={{ width: `${(position / total) * 100}%` }}
          transition={{ type: 'spring', stiffness: 160, damping: 22 }}
        />
      </div>

      <div className="relative z-10 mx-auto flex h-full w-full max-w-[1600px] flex-col px-16 py-14">
        <AnimatePresence mode="wait">
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35 }}
            className="flex flex-1 flex-col gap-8"
          >
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="font-mono text-xs uppercase tracking-[0.32em] text-ink-300">
                  Test {position} of {total}
                </div>
                <CategoryBadge category={m.category} />
                <div className="font-mono text-xs uppercase tracking-[0.24em] text-ink-400">
                  Variation {variation}
                </div>
              </div>
              <div className="font-mono text-xs uppercase tracking-[0.24em] text-ink-400">
                {m.mode === 'image-to-image' ? 'Image edit' : 'Text to image'}
              </div>
            </div>

            {/* Prompt */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-5 text-lg leading-relaxed text-ink-100">
              <span className="mr-2 text-ink-500">“</span>
              {m.prompt}
              <span className="ml-1 text-ink-500">”</span>
            </div>

            {/* Image pair */}
            <div className="flex-1">
              <ImagePair runId={runId} matchup={m} />
            </div>

            {/* Scores + winner */}
            {judgment ? (
              <ScoreCard judgment={judgment} revealed={revealed} />
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-6 text-center text-sm text-ink-400">
                Not yet judged — run{' '}
                <span className="font-mono text-ink-200">npm run judge-status</span>{' '}
                in the project root, then ask Claude to judge pending matchups.
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <KeyboardHint
        hints={[
          { keys: ['←', '→'], label: 'Navigate' },
          { keys: ['R'], label: revealed ? 'Hide scores' : 'Reveal scores' },
          { keys: ['F'], label: 'Fullscreen' },
          { keys: ['3'], label: 'Leaderboard' },
        ]}
      />
    </div>
  );
}
