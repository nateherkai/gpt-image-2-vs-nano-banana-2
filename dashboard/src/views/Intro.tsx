import { motion } from 'framer-motion';
import { KeyboardHint } from '../components/KeyboardHint';

interface Props {
  runId: string | null;
  matchupCount: number;
  judgedCount: number;
}

export function Intro({ runId, matchupCount, judgedCount }: Props) {
  return (
    <div className="grid-bg slide-glow relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative z-10 flex max-w-5xl flex-col items-center gap-8 px-8 text-center"
      >
        <div className="font-mono text-xs uppercase tracking-[0.45em] text-ink-300">
          {runId ?? 'No run yet'} · 30 head-to-head tests
        </div>

        <h1 className="bg-gradient-to-b from-white to-ink-300 bg-clip-text text-7xl font-black leading-[1.05] tracking-tight text-transparent md:text-[128px]">
          GPT Image 2
          <span className="mx-6 text-ink-500">vs</span>
          <span className="block">Nano Banana 2</span>
        </h1>

        <p className="max-w-2xl text-xl leading-relaxed text-ink-300">
          Ten categories. Two frontier image models. One judge:{' '}
          <span className="text-white">Claude Opus 4.7</span>.
        </p>

        <div className="mt-10 flex items-center gap-10 font-mono text-sm">
          <div className="flex flex-col items-center">
            <div className="text-3xl font-bold text-emerald-300">
              {matchupCount}
            </div>
            <div className="text-xs uppercase tracking-[0.22em] text-ink-400">
              matchups
            </div>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="flex flex-col items-center">
            <div className="text-3xl font-bold text-amber-200">
              {judgedCount}
            </div>
            <div className="text-xs uppercase tracking-[0.22em] text-ink-400">
              judged
            </div>
          </div>
        </div>
      </motion.div>

      <KeyboardHint
        hints={[
          { keys: ['2'], label: 'Enter deck' },
          { keys: ['3'], label: 'Leaderboard' },
          { keys: ['F'], label: 'Fullscreen' },
        ]}
      />
    </div>
  );
}
