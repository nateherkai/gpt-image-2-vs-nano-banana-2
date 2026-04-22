import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

// Load .env from the project root explicitly — npm workspaces set CWD to
// scripts/, which would cause the default dotenv resolution to miss the file.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname, '..', '..', '.env') });

import { generate } from './pipeline/generate.js';
import { generateSources } from './pipeline/generate-sources.js';
import { uploadSources } from './pipeline/upload-sources.js';
import { createRun } from './state/store.js';
import { printCredits, printJudgeStatus, printStatus } from './status.js';
import type { Category } from './types.js';

const KNOWN_CATEGORIES: readonly Category[] = [
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
] as const;

interface ParsedArgs {
  flags: Set<string>;
  values: Map<string, string>;
  positional: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const positional: string[] = [];
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq === -1) {
      flags.add(body);
    } else {
      values.set(body.slice(0, eq), body.slice(eq + 1));
    }
  }
  return { flags, values, positional };
}

function asCategory(v: string): Category {
  if (!(KNOWN_CATEGORIES as readonly string[]).includes(v)) {
    throw new Error(
      `Unknown category "${v}". Valid: ${KNOWN_CATEGORIES.join(', ')}`,
    );
  }
  return v as Category;
}

function asPositiveInt(v: string, flag: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`--${flag} must be a positive integer, got "${v}"`);
  }
  return n;
}

function printHelp(): void {
  console.log(
    [
      'Usage: npm run <command> [-- <options>]',
      '',
      'Commands:',
      '  new-run                       Create runs/<YYYY-MM-DD-NNN>/state.json from prompts/',
      '  generate-sources              Generate the 6 source images via GPT Image 2 into sources/',
      '    --only=<filename>           Target a single source file',
      '    --force                     Regenerate even if the file already exists',
      '  upload-sources                Upload sources/*.jpg to kie.ai; populate state.sources',
      '  generate                      Run all pending image generations (resumable)',
      '    --only=<category>           Filter to one category',
      '    --retry-failed              Retry matchups currently in "failed" state',
      '    --limit=<n>                 Cap number of matchups processed (smoke tests)',
      '    --run=<id>                  Target a specific run (default: latest)',
      '  status                        Print generation + judging progress',
      '  judge-status                  List matchups still needing judgment, with file paths',
      '  credits                       Print kie.ai credit balance',
      '  help                          Show this message',
      '',
      'Judging is NOT a CLI command. Claude reads the images in a Claude Code session',
      'and writes runs/<id>/judgments/<matchup-id>.json. See docs/judging-guide.md.',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const command = rawArgs[0];
  const rest = rawArgs.slice(1);
  const args = parseArgs(rest);
  const runIdFlag = args.values.get('run');

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  switch (command) {
    case 'new-run': {
      const state = await createRun(runIdFlag);
      console.log(`Created run ${state.runId} with ${state.matchups.length} matchups.`);
      return;
    }

    case 'generate-sources': {
      await generateSources({
        only: args.values.get('only'),
        force: args.flags.has('force'),
      });
      return;
    }

    case 'upload-sources': {
      await uploadSources({ runId: runIdFlag });
      return;
    }

    case 'generate': {
      const onlyRaw = args.values.get('only');
      const limitRaw = args.values.get('limit');
      await generate({
        runId: runIdFlag,
        only: onlyRaw ? asCategory(onlyRaw) : undefined,
        retryFailed: args.flags.has('retry-failed'),
        limit: limitRaw ? asPositiveInt(limitRaw, 'limit') : undefined,
      });
      return;
    }

    case 'status': {
      await printStatus(runIdFlag);
      return;
    }

    case 'judge-status': {
      await printJudgeStatus(runIdFlag);
      return;
    }

    case 'credits': {
      await printCredits();
      return;
    }

    default: {
      console.error(`Unknown command: ${command}\n`);
      printHelp();
      process.exit(1);
    }
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${msg}`);
  if (process.env['DEBUG'] && err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
