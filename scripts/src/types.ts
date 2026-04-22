// Shared types for the comparison rig. The dashboard imports these too.
// Pure TypeScript — zod runtime validators live in state/schema.ts.

export type ModelId = 'gpt-image-2' | 'nano-banana-2';
export const MODEL_IDS: readonly ModelId[] = ['gpt-image-2', 'nano-banana-2'] as const;

export type Mode = 'text-to-image' | 'image-to-image';

export type Category =
  | 'text-typography'
  | 'portraits'
  | 'complex-scenes'
  | 'product'
  | 'diagrams-ui'
  | 'artistic'
  | 'style-transfer'
  | 'character-consistency'
  | 'object-edit'
  | 'photo-enhance';

export type ModelRunStatus =
  | 'pending'
  | 'submitted'
  | 'polling'
  | 'downloaded'
  | 'failed';

export type Winner = ModelId | 'tie';

export interface AxisScores {
  realism: number;
  adherence: number;
  detail: number;
  /** null when the prompt has no text to render. */
  text: number | null;
  overall: number;
}

export interface ModelRunState {
  status: ModelRunStatus;
  taskId?: string;
  submittedAt?: string;
  completedAt?: string;
  /** Generation duration reported by kie.ai (ms). */
  costTimeMs?: number;
  remoteUrl?: string;
  remoteUrlExpiresAt?: string;
  /** Path relative to the run directory. */
  localPath?: string;
  fileSizeBytes?: number;
  attempts: number;
  lastError?: { code: string; message: string; at: string };
}

export interface Matchup {
  id: string;
  category: Category;
  mode: Mode;
  prompt: string;
  /** Filenames in sources/, only present for image-to-image matchups. */
  sourceImages?: string[];
  notes?: string;
  models: Record<ModelId, ModelRunState>;
}

/**
 * Shape of `runs/<id>/judgments/<matchupId>.json`.
 *
 * Written by Claude in a live Claude Code session, not by the automation script.
 * The dashboard reads these files directly and joins them with state.json by matchupId.
 */
export interface JudgmentFile {
  matchupId: string;
  judgedAt: string;
  judgeModel: string;
  scores: Record<ModelId, AxisScores>;
  winner: Winner;
  /** ≤ 1 sentence verdict shown on the slide. */
  verdict: string;
  /** Longer reasoning, shown in expanded view. */
  reasoning: string;
}

export interface SourceState {
  uploadedUrl: string;
  expiresAt: string;
  sha256: string;
  status: 'uploaded' | 'expired';
}

export interface RunConfig {
  models: readonly ModelId[];
  judgeModel: 'claude-opus-4-7';
  nanoBananaResolution: '1K' | '2K' | '4K';
}

export interface RunState {
  runId: string;
  createdAt: string;
  config: RunConfig;
  sources: Record<string, SourceState>;
  matchups: Matchup[];
}

// Input format for prompt JSON files (no run-state fields yet).
export interface PromptDef {
  id: string;
  category: Category;
  prompt: string;
  sourceImages?: string[];
  notes?: string;
}

export interface PromptManifest {
  matchups: PromptDef[];
}
