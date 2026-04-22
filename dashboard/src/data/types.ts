// Re-export the shared script types so dashboard code imports from one place.
// The `@shared` alias is declared in tsconfig.json + vite.config.ts.
export type {
  AxisScores,
  Category,
  JudgmentFile,
  Matchup,
  ModelId,
  ModelRunState,
  Mode,
  RunConfig,
  RunState,
  SourceState,
  Winner,
} from '@shared/types';
export { MODEL_IDS } from '@shared/types';
