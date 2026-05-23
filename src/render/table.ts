import chalk from 'chalk';
import Table from 'cli-table3';
import type { ProspectResult } from '../types.js';

const TONE_COLOR: Record<string, (s: string) => string> = {
  excited: chalk.yellow,
  frustrated: chalk.red,
  analytical: chalk.cyan,
  reflective: chalk.gray,
  celebratory: chalk.green,
  neutral: chalk.white,
};

function wrap(text: string, width: number): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > width) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines.join('\n');
}

export function renderTable(results: ProspectResult[]): string {
  const table = new Table({
    head: [
      chalk.bold('Prospect'),
      chalk.bold('Platform'),
      chalk.bold('Top Signal'),
      chalk.bold('Tone'),
      chalk.bold('Snippet'),
      chalk.bold('Anchor Post'),
    ],
    colWidths: [18, 10, 16, 14, 50, 50],
    wordWrap: true,
  });

  for (const r of results) {
    if (r.error) {
      table.push([
        chalk.dim(`@${r.prospect.handle}`),
        r.prospect.platform,
        chalk.red('ERROR'),
        '—',
        chalk.red(r.error),
        '—',
      ]);
      continue;
    }
    if (!r.aggregated || !r.snippet) {
      table.push([
        chalk.dim(`@${r.prospect.handle}`),
        r.prospect.platform,
        chalk.dim('no signal'),
        '—',
        chalk.dim(`(${r.postsFetched} posts, none actionable)`),
        '—',
      ]);
      continue;
    }
    const tone = r.aggregated.dominantTone;
    const toneColor = TONE_COLOR[tone] ?? chalk.white;
    const topSignal = r.aggregated.topSignals[0] ?? 'none';
    table.push([
      chalk.bold(`@${r.prospect.handle}`),
      r.prospect.platform,
      chalk.magenta(topSignal),
      toneColor(tone),
      wrap(r.snippet, 46),
      chalk.dim(wrap(`"${r.aggregated.anchor.post.text}"`, 46)),
    ]);
  }
  return table.toString();
}
