interface KeyHint {
  keys: string[];
  label: string;
}

export function KeyboardHint({ hints }: { hints: KeyHint[] }) {
  return (
    <div className="pointer-events-none absolute bottom-6 right-8 flex gap-5 text-[11px] uppercase tracking-[0.22em] text-ink-400">
      {hints.map((h, i) => (
        <div key={i} className="flex items-center gap-2">
          {h.keys.map((k, j) => (
            <kbd
              key={j}
              className="rounded border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-ink-200"
            >
              {k}
            </kbd>
          ))}
          <span>{h.label}</span>
        </div>
      ))}
    </div>
  );
}
