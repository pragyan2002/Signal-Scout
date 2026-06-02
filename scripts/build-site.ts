import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Build a single self-contained dist/index.html with all run data embedded.
// No runtime fetch -> no base-path / CORS / Jekyll issues on GitHub Pages, and
// it renders identically from file:// for local verification.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUNS_DIR = join(ROOT, 'runs');
const CONFIG_DIR = join(ROOT, 'config');
const DIST_DIR = join(ROOT, 'dist');

const RUN_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;

interface RunFile {
  date: string;
  generatedAt: string;
  model: string;
  results: unknown[];
}

async function readRuns(): Promise<RunFile[]> {
  const names = await readdir(RUNS_DIR);
  const runs: RunFile[] = [];
  for (const name of names.sort()) {
    const m = RUN_FILE_RE.exec(name);
    if (!m) continue;
    try {
      const raw = await readFile(join(RUNS_DIR, name), 'utf8');
      const parsed = JSON.parse(raw) as Partial<RunFile>;
      if (!Array.isArray(parsed.results)) {
        console.warn(`! skipping ${name}: no results array`);
        continue;
      }
      runs.push({
        date: m[1]!,
        generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : m[1]!,
        model: typeof parsed.model === 'string' ? parsed.model : 'unknown',
        results: parsed.results,
      });
    } catch (err) {
      console.warn(`! skipping ${name}: ${(err as Error).message}`);
    }
  }
  return runs;
}

async function readProse(): Promise<{ pitch: string; icp: string }> {
  const [pitch, icp] = await Promise.all([
    readFile(join(CONFIG_DIR, 'pitch.md'), 'utf8').catch(() => ''),
    readFile(join(CONFIG_DIR, 'icp.md'), 'utf8').catch(() => ''),
  ]);
  return { pitch, icp };
}

const STYLES = `
:root {
  --bg: #0d1117;
  --panel: #161b22;
  --panel-2: #1c2430;
  --border: #2a3340;
  --text: #e6edf3;
  --muted: #8b98a5;
  --accent: #4493f8;
  --accent-2: #f778ba;
  --twitter: #1d9bf0;
  --linkedin: #0a66c2;
  --bluesky: #1185fe;
  --good: #3fb950;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.wrap { max-width: 1120px; margin: 0 auto; padding: 0 24px 80px; }

/* Hero */
.hero { padding: 64px 0 28px; border-bottom: 1px solid var(--border); }
.eyebrow { color: var(--accent); font-weight: 600; letter-spacing: .04em; text-transform: uppercase; font-size: 12px; }
.hero h1 { font-size: 44px; line-height: 1.08; margin: 14px 0 12px; letter-spacing: -.02em; }
.hero h1 .grad { background: linear-gradient(90deg, var(--accent), var(--accent-2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.hero p.lede { font-size: 18px; color: var(--muted); max-width: 720px; margin: 0; }
.badges { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px; }
.pill { display: inline-flex; align-items: center; gap: 7px; background: var(--panel); border: 1px solid var(--border); border-radius: 999px; padding: 6px 13px; font-size: 13px; color: var(--muted); }
.pill .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--good); box-shadow: 0 0 0 3px rgba(63,185,80,.18); }

/* Controls */
.controls { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin: 32px 0 10px; }
.controls h2 { font-size: 15px; color: var(--muted); font-weight: 600; margin: 0; text-transform: uppercase; letter-spacing: .04em; }
.timeline { display: flex; gap: 6px; flex-wrap: wrap; }
.tl-btn { background: var(--panel); border: 1px solid var(--border); color: var(--muted); border-radius: 8px; padding: 6px 11px; font-size: 13px; cursor: pointer; font-variant-numeric: tabular-nums; }
.tl-btn:hover { border-color: var(--accent); color: var(--text); }
.tl-btn.active { background: var(--accent); border-color: var(--accent); color: #08111f; font-weight: 600; }

/* Summary */
.summary { display: flex; gap: 14px; flex-wrap: wrap; margin: 6px 0 26px; color: var(--muted); font-size: 13px; }
.summary b { color: var(--text); }

/* Cards */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(440px, 1fr)); gap: 18px; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.card-head { display: flex; align-items: center; gap: 11px; }
.avatar { width: 38px; height: 38px; border-radius: 50%; flex: 0 0 auto; display: grid; place-items: center; font-weight: 700; color: #fff; font-size: 15px; }
.who { display: flex; flex-direction: column; min-width: 0; }
.who .name { font-weight: 650; }
.who .handle { color: var(--muted); font-size: 13px; }
.plat { margin-left: auto; font-size: 11px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; padding: 4px 9px; border-radius: 6px; color: #fff; white-space: nowrap; }
.plat.live::after { content: " · live"; opacity: .85; font-weight: 600; }

.chips { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.chip { font-size: 12px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--panel-2); color: var(--text); }
.chip.signal { border-color: rgba(247,120,186,.4); color: #ffc4e3; background: rgba(247,120,186,.08); font-weight: 600; }
.chip.tone { border-color: rgba(68,147,248,.4); color: #b3d4ff; background: rgba(68,147,248,.08); }
.chip.topic { color: var(--muted); }

.flow { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--border); border-radius: 11px; overflow: hidden; }
.flow .block { padding: 14px 15px; }
.flow .post { background: var(--panel-2); }
.flow .label { font-size: 10.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: var(--muted); margin-bottom: 7px; display: flex; justify-content: space-between; }
.flow .post-text { font-size: 14px; color: var(--text); white-space: pre-wrap; }
.flow .arrow { text-align: center; color: var(--muted); font-size: 12px; padding: 5px 0; background: var(--panel-2); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.flow .opener { background: linear-gradient(180deg, rgba(68,147,248,.06), rgba(247,120,186,.05)); }
.flow .opener .opener-text { font-size: 16px; line-height: 1.5; color: #fff; font-weight: 500; }
.post-meta { color: var(--muted); font-size: 12px; font-weight: 400; text-transform: none; letter-spacing: 0; }

.muted-card { color: var(--muted); font-style: italic; padding: 10px 2px; }

footer { margin-top: 48px; padding-top: 22px; border-top: 1px solid var(--border); color: var(--muted); font-size: 13px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; }

/* About */
.about { margin-top: 44px; background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 24px 26px; }
.about h3 { margin: 0 0 12px; font-size: 14px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.about p { margin: 0 0 12px; color: var(--text); }
.about p:last-child { margin-bottom: 0; }
.about strong { color: #fff; }

@media (max-width: 640px) {
  .hero h1 { font-size: 32px; }
  .grid { grid-template-columns: 1fr; }
}
`;

// Client script authored with string concatenation (no nested template literals
// or ${}) so it embeds cleanly inside the page template below.
const CLIENT_JS = [
  '(function(){',
  "  var DATA = JSON.parse(document.getElementById('site-data').textContent);",
  '  var runs = DATA.runs || [];',
  '  var current = runs.length - 1;',
  "  var PLAT_COLOR = { twitter: 'var(--twitter)', linkedin: 'var(--linkedin)', bluesky: 'var(--bluesky)' };",
  '',
  "  function esc(s){ var d = document.createElement('div'); d.textContent = (s==null?'':String(s)); return d.innerHTML; }",
  '  function el(tag, cls, html){ var e = document.createElement(tag); if(cls) e.className = cls; if(html!=null) e.innerHTML = html; return e; }',
  "  function initials(name, handle){ var s = (name||handle||'?').trim(); var p = s.split(/\\s+/); return ((p[0]||'?')[0] + (p.length>1?(p[1][0]||''):'')).toUpperCase(); }",
  "  function fmtDate(iso){ try { return new Date(iso).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}); } catch(e){ return iso; } }",
  '',
  '  function buildTimeline(){',
  "    var tl = document.getElementById('timeline'); tl.innerHTML = '';",
  '    runs.forEach(function(r, i){',
  "      var b = el('button', 'tl-btn' + (i===current?' active':''), esc(r.date));",
  '      b.onclick = function(){ current = i; render(); };',
  '      tl.appendChild(b);',
  '    });',
  '  }',
  '',
  '  function avatar(p){',
  "    var a = el('div','avatar'); a.textContent = initials(p.displayName, p.handle);",
  "    a.style.background = PLAT_COLOR[p.platform] || '#444'; return a;",
  '  }',
  '',
  '  function card(res){',
  '    var p = res.prospect || {};',
  "    var c = el('div','card');",
  "    var head = el('div','card-head');",
  '    head.appendChild(avatar(p));',
  "    var who = el('div','who');",
  "    var nm = el('div','name'); nm.textContent = p.displayName || ('@'+p.handle); who.appendChild(nm);",
  "    var hd = el('div','handle');",
  "    var link = el('a'); link.href = p.profileUrl || '#'; link.target = '_blank'; link.rel='noopener'; link.textContent = '@'+p.handle;",
  '    hd.appendChild(link); who.appendChild(hd);',
  '    head.appendChild(who);',
  "    var plat = el('span','plat' + (p.platform==='bluesky'?' live':'')); plat.textContent = p.platform || '';",
  "    plat.style.background = PLAT_COLOR[p.platform] || '#444'; head.appendChild(plat);",
  '    c.appendChild(head);',
  '',
  '    var agg = res.aggregated;',
  '    if(!agg){',
  "      var m = el('div','muted-card');",
  "      m.textContent = res.error ? ('No signal this run — ' + res.error) : 'No qualifying posts in this run.';",
  '      c.appendChild(m); return c;',
  '    }',
  '',
  "    var chips = el('div','chips');",
  "    var sig = (agg.topSignals && agg.topSignals[0]) || 'signal';",
  "    chips.appendChild(el('span','chip signal', esc(sig.replace(/_/g,' '))));",
  "    if(agg.dominantTone){ chips.appendChild(el('span','chip tone', esc(agg.dominantTone))); }",
  "    (agg.topTopics||[]).slice(0,3).forEach(function(t){ chips.appendChild(el('span','chip topic', esc(t))); });",
  '    c.appendChild(chips);',
  '',
  '    var anchor = agg.anchor || {}; var post = anchor.post || {};',
  "    var flow = el('div','flow');",
  "    var pb = el('div','block post');",
  "    var plabel = el('div','label');",
  "    plabel.appendChild(el('span',null,'What they posted'));",
  "    var meta = el('span','post-meta'); meta.textContent = post.createdAt ? fmtDate(post.createdAt) : '';",
  '    plabel.appendChild(meta); pb.appendChild(plabel);',
  "    var ptxt = el('div','post-text'); ptxt.textContent = post.text || ''; pb.appendChild(ptxt);",
  "    if(post.url){ var vl = el('div'); vl.style.marginTop='8px'; var va = el('a'); va.href=post.url; va.target='_blank'; va.rel='noopener'; va.style.fontSize='12px'; va.textContent='View post \\u2197'; vl.appendChild(va); pb.appendChild(vl); }",
  '    flow.appendChild(pb);',
  "    flow.appendChild(el('div','arrow','\\u2193  Signal Scout writes'));",
  "    var ob = el('div','block opener');",
  "    ob.appendChild(el('div','label','Your opener'));",
  "    var ot = el('div','opener-text'); ot.textContent = res.snippet || '(no opener generated)'; ob.appendChild(ot);",
  '    flow.appendChild(ob);',
  '    c.appendChild(flow);',
  '    return c;',
  '  }',
  '',
  '  function render(){',
  '    buildTimeline();',
  '    var run = runs[current]; if(!run){ return; }',
  '    var PLAT_ORDER = { bluesky: 0, twitter: 1, linkedin: 2 };',
  '    function platRank(r){ var v = r.prospect && PLAT_ORDER[r.prospect.platform]; return v==null ? 9 : v; }',
  '    function contentRank(r){ return r.snippet ? 0 : (r.aggregated ? 1 : 2); }',
  '    var results = (run.results || []).slice().sort(function(a, b){',
  '      return platRank(a) - platRank(b) || contentRank(a) - contentRank(b);',
  '    });',
  "    var live = results.filter(function(r){ return r.prospect && r.prospect.platform==='bluesky'; }).length;",
  '    var withSig = results.filter(function(r){ return r.aggregated; }).length;',
  "    var s = document.getElementById('summary');",
  "    s.innerHTML = '<span><b>'+results.length+'</b> prospects scanned</span>' +",
  "      '<span><b>'+live+'</b> live Bluesky accounts</span>' +",
  "      '<span><b>'+withSig+'</b> openers generated</span>' +",
  "      '<span>model <b>'+esc(run.model)+'</b></span>';",
  "    var grid = document.getElementById('grid'); grid.innerHTML = '';",
  '    results.forEach(function(r){ grid.appendChild(card(r)); });',
  "    var f = document.getElementById('foot-meta');",
  "    f.textContent = 'Run ' + run.date + ' · generated ' + fmtDate(run.generatedAt) + ' · model ' + run.model;",
  '  }',
  '',
  '  render();',
  '})();',
].join('\n');

function mdToHtml(md: string): string {
  // Minimal: escape, drop the leading H1, bold, paragraphs.
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = md
    .split('\n')
    .filter((l) => !/^#\s/.test(l))
    .join('\n')
    .trim();
  return esc(body)
    .split(/\n\s*\n/)
    .map(
      (p) =>
        '<p>' + p.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, ' ') + '</p>',
    )
    .join('\n');
}

function page(siteData: object, prose: { pitch: string; icp: string }): string {
  // Escape "<" inside the embedded JSON to prevent </script> breakout / XSS.
  const dataJson = JSON.stringify(siteData).replace(/</g, '\\u003c');
  const aboutPitch = mdToHtml(prose.pitch);
  const aboutIcp = mdToHtml(prose.icp);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Signal Scout — outbound that reads the room</title>
<meta name="description" content="Signal Scout reads what prospects post in public and writes the opening line of a cold message that sounds like a human paid attention." />
<style>${STYLES}</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <div class="eyebrow">Signal Scout</div>
    <h1>Outbound that <span class="grad">actually read the post.</span></h1>
    <p class="lede">For every prospect, Signal Scout reads their recent public activity, finds the signal worth acting on, and writes one grounded opening line — referencing the thing they actually said, not their job title.</p>
    <div class="badges">
      <span class="pill"><span class="dot"></span> Live data · public Bluesky API</span>
      <span class="pill">Refreshes daily via GitHub Actions</span>
      <span class="pill">No database · git history is the run log</span>
    </div>
  </header>

  <div class="controls">
    <h2>Run history</h2>
    <div class="timeline" id="timeline"></div>
  </div>
  <div class="summary" id="summary"></div>

  <div class="grid" id="grid"></div>

  <section class="about">
    <h3>What this is</h3>
    ${aboutPitch}
    <h3 style="margin-top:22px">Who it's for</h3>
    ${aboutIcp}
  </section>

  <footer>
    <span id="foot-meta"></span>
    <span>Built from public posts. Openers are model-generated and grounded in the anchor post above.</span>
  </footer>
</div>

<script type="application/json" id="site-data">${dataJson}</script>
<script>${CLIENT_JS}</script>
</body>
</html>
`;
}

async function main(): Promise<void> {
  const [runs, prose] = await Promise.all([readRuns(), readProse()]);
  if (runs.length === 0) {
    console.warn('! no runs found — building an empty dashboard');
  }
  const siteData = { builtAt: new Date().toISOString(), runs };
  const html = page(siteData, prose);
  await mkdir(DIST_DIR, { recursive: true });
  await writeFile(join(DIST_DIR, 'index.html'), html, 'utf8');
  await writeFile(join(DIST_DIR, '.nojekyll'), '', 'utf8');
  console.log(`Built dist/index.html — ${runs.length} runs embedded.`);
}

main().catch((err) => {
  console.error('build-site failed:', err);
  process.exit(1);
});
