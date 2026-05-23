import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import {
  ProspectListSchema,
  type ExtractedPost,
  type Post,
  type Prospect,
  type ProspectResult,
} from './types.js';
import { createDispatcher } from './sources/dispatch.js';
import { createChatClient } from './llm/client.js';
import { createExtractor } from './extract/extractor.js';
import { createSnippetGenerator } from './snippet/generator.js';
import { aggregate } from './snippet/aggregate.js';
import { renderTable } from './render/table.js';
import { writeJsonOutput } from './render/json.js';
import { loadEnv } from './util/env.js';

const SINCE_DAYS = 14;
const ROOT = process.cwd();
const FIXTURES_ROOT = join(ROOT, 'fixtures');
const CONFIG_DIR = join(ROOT, 'config');
const OUTPUT_FILE = join(ROOT, 'output.json');

async function loadConfig() {
  const [prospectsRaw, icp, pitch] = await Promise.all([
    readFile(join(CONFIG_DIR, 'prospects.json'), 'utf8'),
    readFile(join(CONFIG_DIR, 'icp.md'), 'utf8'),
    readFile(join(CONFIG_DIR, 'pitch.md'), 'utf8'),
  ]);
  const prospects = ProspectListSchema.parse(JSON.parse(prospectsRaw));
  return { prospects, icp, pitch };
}

async function processProspect(args: {
  prospect: Prospect;
  posts: Post[];
  extractor: ReturnType<typeof createExtractor>;
  snippetGen: ReturnType<typeof createSnippetGenerator>;
  icp: string;
  pitch: string;
}): Promise<ProspectResult> {
  const { prospect, posts, extractor, snippetGen, icp, pitch } = args;
  const extracted: ExtractedPost[] = [];
  for (const post of posts) {
    try {
      const signals = await extractor.extract(post);
      extracted.push({ post, signals });
    } catch (err) {
      console.error(
        chalk.yellow(`  ! extract failed for ${post.id}: ${(err as Error).message.slice(0, 120)}`),
      );
    }
  }
  const aggregated = aggregate(extracted);
  if (!aggregated) {
    return {
      prospect,
      postsFetched: posts.length,
      postsExtracted: extracted.length,
      aggregated: null,
      snippet: null,
    };
  }
  let snippet: string | null = null;
  try {
    snippet = await snippetGen.generate({ prospect, aggregated, icp, pitch });
  } catch (err) {
    console.error(chalk.yellow(`  ! snippet failed: ${(err as Error).message.slice(0, 120)}`));
  }
  return {
    prospect,
    postsFetched: posts.length,
    postsExtracted: extracted.length,
    aggregated,
    snippet,
  };
}

async function main(): Promise<void> {
  const env = loadEnv();
  const { prospects, icp, pitch } = await loadConfig();
  const dispatcher = createDispatcher({ fixturesRoot: FIXTURES_ROOT });
  const llm = createChatClient({ apiKey: env.apiKey, baseUrl: env.baseUrl, model: env.model });
  const extractor = createExtractor(llm);
  const snippetGen = createSnippetGenerator(llm);

  console.log(chalk.bold(`\n  Signal Scout — ${prospects.length} prospects, model=${env.model}\n`));

  const results: ProspectResult[] = [];
  for (const prospect of prospects) {
    const source = dispatcher(prospect);
    console.log(
      chalk.dim(`  → ${source.name} fetching @${prospect.handle} (${prospect.platform})`),
    );
    try {
      const posts = await source.fetchRecentPosts(prospect, SINCE_DAYS);
      if (posts.length === 0) {
        console.log(chalk.dim(`    (no posts in last ${SINCE_DAYS} days)`));
        results.push({
          prospect,
          postsFetched: 0,
          postsExtracted: 0,
          aggregated: null,
          snippet: null,
        });
        continue;
      }
      console.log(chalk.dim(`    fetched ${posts.length} posts, extracting…`));
      const result = await processProspect({
        prospect,
        posts,
        extractor,
        snippetGen,
        icp,
        pitch,
      });
      results.push(result);
    } catch (err) {
      const msg = (err as Error).message;
      console.error(chalk.red(`    fetch failed: ${msg.slice(0, 200)}`));
      results.push({
        prospect,
        postsFetched: 0,
        postsExtracted: 0,
        aggregated: null,
        snippet: null,
        error: msg,
      });
    }
  }

  console.log('\n' + renderTable(results) + '\n');
  await writeJsonOutput(OUTPUT_FILE, results);
  console.log(chalk.dim(`  wrote ${OUTPUT_FILE}\n`));
}

main().catch((err) => {
  console.error(chalk.red('\nFATAL:'), err);
  process.exit(1);
});
