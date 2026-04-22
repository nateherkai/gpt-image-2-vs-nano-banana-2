import { useCallback, useEffect, useState } from 'react';
import { Intro } from './views/Intro';
import { Leaderboard } from './views/Leaderboard';
import { SlideDeck } from './views/SlideDeck';
import { useLatestRun } from './data/useRun';

type View = 'intro' | 'deck' | 'leaderboard';

function viewFromHash(): View {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash === 'deck' || hash === 'leaderboard') return hash;
  return 'intro';
}

function setView(view: View): void {
  window.location.hash = `#/${view}`;
}

async function toggleFullscreen(): Promise<void> {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen().catch(() => {});
  } else {
    await document.exitFullscreen().catch(() => {});
  }
}

export default function App() {
  const [view, setViewState] = useState<View>(viewFromHash);
  const run = useLatestRun();

  useEffect(() => {
    const onHash = () => setViewState(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === '1') setView('intro');
      else if (e.key === '2') setView('deck');
      else if (e.key === '3') setView('leaderboard');
      else if (e.key.toLowerCase() === 'f') toggleFullscreen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const jumpToDeck = useCallback(() => setView('deck'), []);

  if (run.loading && !run.bundle) {
    return <CenteredStatus title="Loading run…" />;
  }
  if (run.error) {
    return <CenteredStatus title="Error" subtitle={run.error} />;
  }
  if (!run.bundle || !run.runId) {
    return (
      <CenteredStatus
        title="No runs yet"
        subtitle={'Run `npm run new-run` to create one, then refresh.'}
      />
    );
  }

  const { state, judgments } = run.bundle;
  const matchupCount = state.matchups.length;
  const judgedCount = Object.keys(judgments).length;

  if (view === 'intro') {
    return (
      <div onClick={jumpToDeck} className="cursor-pointer">
        <Intro
          runId={run.runId}
          matchupCount={matchupCount}
          judgedCount={judgedCount}
        />
      </div>
    );
  }
  if (view === 'deck') {
    return (
      <SlideDeck
        runId={run.runId}
        matchups={state.matchups}
        judgments={judgments}
      />
    );
  }
  return <Leaderboard matchups={state.matchups} judgments={judgments} />;
}

function CenteredStatus({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="text-center">
        <div className="font-mono text-xs uppercase tracking-[0.32em] text-ink-300">
          {title}
        </div>
        {subtitle && (
          <div className="mt-2 font-mono text-sm text-ink-400">{subtitle}</div>
        )}
      </div>
    </div>
  );
}
