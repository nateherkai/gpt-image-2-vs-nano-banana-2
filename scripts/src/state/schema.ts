// Runtime validation for state.json and prompt manifests.
import { z } from 'zod';
import type {
  AxisScores,
  JudgmentFile,
  Matchup,
  ModelRunState,
  PromptManifest,
  RunState,
  SourceState,
} from '../types.js';

const ModelIdSchema = z.enum(['gpt-image-2', 'nano-banana-2']);

const CategorySchema = z.enum([
  'text-typography',
  'portraits',
  'complex-scenes',
  'product',
  'diagrams-ui',
  'artistic',
  'style-transfer',
  'character-consistency',
  'object-edit',
  'photo-enhance',
]);

const ModeSchema = z.enum(['text-to-image', 'image-to-image']);

const ErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  at: z.string(),
});

export const ModelRunStateSchema = z.object({
  status: z.enum(['pending', 'submitted', 'polling', 'downloaded', 'failed']),
  taskId: z.string().optional(),
  submittedAt: z.string().optional(),
  completedAt: z.string().optional(),
  costTimeMs: z.number().optional(),
  remoteUrl: z.string().optional(),
  remoteUrlExpiresAt: z.string().optional(),
  localPath: z.string().optional(),
  fileSizeBytes: z.number().optional(),
  attempts: z.number().int().nonnegative(),
  lastError: ErrorSchema.optional(),
}) satisfies z.ZodType<ModelRunState>;

const AxisScoresSchema = z.object({
  realism: z.number(),
  adherence: z.number(),
  detail: z.number(),
  text: z.number().nullable(),
  overall: z.number(),
}) satisfies z.ZodType<AxisScores>;

export const MatchupSchema = z.object({
  id: z.string(),
  category: CategorySchema,
  mode: ModeSchema,
  prompt: z.string(),
  sourceImages: z.array(z.string()).optional(),
  notes: z.string().optional(),
  models: z.object({
    'gpt-image-2': ModelRunStateSchema,
    'nano-banana-2': ModelRunStateSchema,
  }),
}) satisfies z.ZodType<Matchup>;

const SourceStateSchema = z.object({
  uploadedUrl: z.string(),
  expiresAt: z.string(),
  sha256: z.string(),
  status: z.enum(['uploaded', 'expired']),
}) satisfies z.ZodType<SourceState>;

export const RunStateSchema = z.object({
  runId: z.string(),
  createdAt: z.string(),
  config: z.object({
    models: z.array(ModelIdSchema).readonly(),
    judgeModel: z.literal('claude-opus-4-7'),
    nanoBananaResolution: z.enum(['1K', '2K', '4K']),
  }),
  sources: z.record(z.string(), SourceStateSchema),
  matchups: z.array(MatchupSchema),
}) satisfies z.ZodType<RunState>;

export const PromptDefSchema = z.object({
  id: z.string(),
  category: CategorySchema,
  prompt: z.string().min(1),
  sourceImages: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const PromptManifestSchema = z.object({
  matchups: z.array(PromptDefSchema),
}) satisfies z.ZodType<PromptManifest>;

export const SourceImageDefSchema = z.object({
  filename: z.string().regex(/\.(jpg|jpeg|png)$/i),
  prompt: z.string().min(1),
  notes: z.string().optional(),
});

export const SourceImageManifestSchema = z.object({
  sources: z.array(SourceImageDefSchema),
});

export type SourceImageDef = z.infer<typeof SourceImageDefSchema>;

// Validates the on-disk judgment files (runs/<id>/judgments/<matchupId>.json)
// written by Claude in a live Claude Code session.
export const JudgmentFileSchema = z.object({
  matchupId: z.string(),
  judgedAt: z.string(),
  judgeModel: z.string(),
  scores: z.object({
    'gpt-image-2': AxisScoresSchema,
    'nano-banana-2': AxisScoresSchema,
  }),
  winner: z.union([ModelIdSchema, z.literal('tie')]),
  verdict: z.string().min(1),
  reasoning: z.string().min(1),
}) satisfies z.ZodType<JudgmentFile>;
