import type { Matchup } from '../data/types';
import { MODEL_LABELS } from '../lib/matchup';
import { imageUrl } from '../data/api';

interface Props {
  runId: string;
  matchup: Matchup;
}

function formatDuration(ms: number | undefined): string {
  if (typeof ms !== 'number') return '—';
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ImagePair({ runId, matchup }: Props) {
  return (
    <div className="grid grid-cols-2 gap-6">
      {(['gpt-image-2', 'nano-banana-2'] as const).map((modelId) => {
        const ms = matchup.models[modelId];
        const src = ms.localPath ? imageUrl(runId, ms.localPath) : null;
        const accent = modelId === 'gpt-image-2' ? 'text-emerald-300' : 'text-sky-300';
        return (
          <div
            key={modelId}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-ink-900/60 shadow-2xl shadow-black/40 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <div className={`font-mono text-xs uppercase tracking-[0.24em] ${accent}`}>
                {MODEL_LABELS[modelId]}
              </div>
              <div className="text-xs text-ink-300">
                {formatDuration(ms.costTimeMs)}
              </div>
            </div>
            <div className="relative aspect-square bg-black">
              {src ? (
                <img
                  src={src}
                  alt={`${MODEL_LABELS[modelId]} — ${matchup.id}`}
                  className="h-full w-full object-contain"
                  loading="eager"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-ink-400">
                  <div className="text-center">
                    <div className="font-mono text-xs uppercase tracking-widest">
                      {ms.status}
                    </div>
                    {ms.lastError && (
                      <div className="mt-1 max-w-[80%] text-[10px] text-rose-300">
                        {ms.lastError.message}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
