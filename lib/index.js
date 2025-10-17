const fs = require('fs');
const path = require('path');

const defaultExtensions = new Set(['.vue', '.js', '.css']);
const defaultIgnoreDirectories = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  '.next',
  '.nuxt',
  'dist',
  'build',
  'coverage',
  '.cache',
  'out',
  'target',
  '.output',
  'public',
  'temp',
  'logs',
  'cache',
  'vendor',
]);

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    json: false,
    counts: false,
    exts: defaultExtensions,
    relative: false,
    maxSizeBytes: 5 * 1024 * 1024,
    includeLines: false,
    includeSnippets: false,
    mdOut: null,
    csvOut: null,
    includeDirs: new Set(),
    excludeDirs: new Set(),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--root') {
      const next = argv[i + 1];
      if (!next) throw new Error('--root requires a path');
      args.root = path.resolve(process.cwd(), next);
      i += 1;
    } else if (token === '--json') {
      args.json = true;
    } else if (token === '--counts') {
      args.counts = true;
    } else if (token === '--exts') {
      const next = argv[i + 1];
      if (!next) throw new Error('--exts requires a comma-separated list like .vue,.js,.css');
      const parts = next
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      args.exts = new Set(parts.map((p) => (p.startsWith('.') ? p : `.${p}`)));
      i += 1;
    } else if (token === '--relative') {
      args.relative = true;
    } else if (token === '--max-size') {
      const next = argv[i + 1];
      if (!next) throw new Error('--max-size requires a number in bytes');
      const num = Number(next);
      if (!Number.isFinite(num) || num <= 0)
        throw new Error('--max-size must be a positive number');
      args.maxSizeBytes = num;
      i += 1;
    } else if (token === '--lines') {
      args.includeLines = true;
    } else if (token === '--snippets') {
      args.includeSnippets = true;
    } else if (token === '--md') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args.mdOut = path.resolve(process.cwd(), next);
        i += 1;
      } else {
        args.mdOut = path.resolve(process.cwd(), 'comment-report.md');
      }
    } else if (token === '--csv') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args.csvOut = path.resolve(process.cwd(), next);
        i += 1;
      } else {
        args.csvOut = path.resolve(process.cwd(), 'comment-lines.csv');
      }
    } else if (token === '--include') {
      const next = argv[i + 1];
      if (!next) throw new Error('--include requires a comma-separated list of directory names');
      const parts = next
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      args.includeDirs = new Set(parts);
      i += 1;
    } else if (token === '--exclude') {
      const next = argv[i + 1];
      if (!next) throw new Error('--exclude requires a comma-separated list of directory names');
      const parts = next
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      args.excludeDirs = new Set(parts);
      i += 1;
    }
  }
  return args;
}

async function* walkDirectory(startDir, ignoreDirectories) {
  const stack = [startDir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch (err) {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (ignoreDirectories.has(entry.name)) continue;
        stack.push(fullPath);
      } else if (entry.isFile()) {
        yield fullPath;
      }
    }
  }
}

const htmlCommentOpenPattern = /<!--/;
const blockCommentPattern = /\/\*[\s\S]*?\*\//;
const lineCommentPattern = /(^|\s)\/\/.*$/m;

function detectCommentTypes(content, extension) {
  const types = new Set();
  if (extension === '.vue') {
    if (htmlCommentOpenPattern.test(content)) types.add('html');
    if (blockCommentPattern.test(content)) types.add('block');
    if (lineCommentPattern.test(content)) types.add('line');
  } else if (extension === '.js' || extension === '.css') {
    if (blockCommentPattern.test(content)) types.add('block');
    if (lineCommentPattern.test(content)) types.add('line');
  }
  return types;
}

function buildLineStartIndices(content) {
  const indices = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content.charCodeAt(i) === 10) indices.push(i + 1);
  }
  return indices;
}

function indexToLine(index, lineStarts) {
  let left = 0;
  let right = lineStarts.length - 1;
  while (left <= right) {
    const mid = (left + right) >> 1;
    if (lineStarts[mid] <= index) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return right + 1;
}

function extractComments(content, extension) {
  const comments = [];
  const lineStarts = buildLineStartIndices(content);

  if (extension === '.vue' || extension === '.js' || extension === '.css') {
    const reBlock = /\/\*[\s\S]*?\*\//g;
    let m;
    while ((m = reBlock.exec(content)) !== null) {
      const startIdx = m.index;
      const endIdx = m.index + m[0].length - 1;
      const startLine = indexToLine(startIdx, lineStarts);
      const endLine = indexToLine(endIdx, lineStarts);
      comments.push({ type: 'block', startLine, endLine, text: m[0] });
    }
  }

  if (extension === '.vue') {
    const reHtml = /<!--[\s\S]*?-->/g;
    let m;
    while ((m = reHtml.exec(content)) !== null) {
      const startIdx = m.index;
      const endIdx = m.index + m[0].length - 1;
      const startLine = indexToLine(startIdx, lineStarts);
      const endLine = indexToLine(endIdx, lineStarts);
      comments.push({ type: 'html', startLine, endLine, text: m[0] });
    }
  }

  if (extension === '.vue' || extension === '.js' || extension === '.css') {
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      let idx = line.indexOf('//');
      while (idx !== -1) {
        const prevChar = idx > 0 ? line[idx - 1] : '';
        if (prevChar !== ':') {
          const text = line.slice(idx);
          comments.push({ type: 'line', startLine: i + 1, endLine: i + 1, text });
          break;
        }
        idx = line.indexOf('//', idx + 2);
      }
    }
  }

  comments.sort(
    (a, b) => a.startLine - b.startLine || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0)
  );
  return comments;
}

async function run(options) {
  const args = { ...options };
  const rootDir = args.root || process.cwd();
  if (!args.exts) args.exts = defaultExtensions;
  const results = [];
  const summary = {
    totalScanned: 0,
    totalMatched: 0,
    byExtension: {},
    byType: { html: 0, line: 0, block: 0 },
  };
  for (const ext of args.exts) summary.byExtension[ext] = 0;

  const effectiveIgnore = new Set(defaultIgnoreDirectories);
  for (const inc of args.includeDirs) effectiveIgnore.delete(inc);
  for (const exc of args.excludeDirs) effectiveIgnore.add(exc);

  for await (const filePath of walkDirectory(rootDir, effectiveIgnore)) {
    const ext = path.extname(filePath);
    if (!args.exts.has(ext)) continue;
    summary.totalScanned += 1;

    let stat;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      continue;
    }
    if (args.maxSizeBytes && stat.size > args.maxSizeBytes) continue;

    let content;
    try {
      content = await fs.promises.readFile(filePath, 'utf8');
    } catch {
      continue;
    }

    const types = detectCommentTypes(content, ext);
    if (types.size === 0) continue;
    summary.totalMatched += 1;
    summary.byExtension[ext] = (summary.byExtension[ext] || 0) + 1;
    if (types.has('html')) summary.byType.html += 1;
    if (types.has('line')) summary.byType.line += 1;
    if (types.has('block')) summary.byType.block += 1;

    const item = {
      path: args.relative ? path.relative(rootDir, filePath) : filePath,
      extension: ext,
      types: Array.from(types.values()).sort(),
    };
    if (args.includeLines || args.includeSnippets || args.mdOut || args.csvOut) {
      const comments = extractComments(content, ext);
      item.comments = comments.map((c) => ({
        type: c.type,
        startLine: c.startLine,
        endLine: c.endLine,
        text: c.text,
      }));
    }
    results.push(item);
  }

  return { results, summary, args, rootDir };
}

function toMarkdown(items, summary, args, rootDir) {
  const lines = [];
  lines.push(`# Comment Report`);
  lines.push('');
  lines.push(`Root: ${args.relative ? path.relative(process.cwd(), rootDir) : rootDir}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  for (const item of items) {
    lines.push(`## ${item.path}`);
    const commentCount = item.comments ? item.comments.length : 0;
    lines.push(`- Comments: ${commentCount}`);
    lines.push('');
    if (!item.comments || item.comments.length === 0) continue;
    for (const c of item.comments) {
      const range = c.startLine === c.endLine ? `L${c.startLine}` : `L${c.startLine}-L${c.endLine}`;
      lines.push(`- Type: ${c.type} | ${range}`);
      if (args.includeSnippets) {
        lines.push('');
        lines.push('```');
        lines.push(c.text);
        lines.push('```');
        lines.push('');
      }
    }
    lines.push('');
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('Summary');
  lines.push('');
  lines.push(`- Scanned files: ${summary.totalScanned}`);
  lines.push(`- Matched files: ${summary.totalMatched}`);
  for (const [ext, count] of Object.entries(summary.byExtension)) lines.push(`- ${ext}: ${count}`);
  return lines.join('\n');
}

function toCsv(results) {
  function csvEscape(value) {
    const s = String(value);
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }
  const lines = ['file,line_numbers'];
  for (const item of results) {
    const file = item.path;
    const ranges = (item.comments || [])
      .map((c) => (c.startLine === c.endLine ? `${c.startLine}` : `${c.startLine}-${c.endLine}`))
      .join(',');
    lines.push(`${csvEscape(file)},${csvEscape(ranges)}`);
  }
  return lines.join('\n');
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const { results, summary, rootDir } = await run(args);

  if (args.mdOut) {
    const md = toMarkdown(
      results.map((r) => ({ ...r, comments: r.comments || [] })),
      summary,
      args,
      rootDir
    );
    await fs.promises.mkdir(path.dirname(args.mdOut), { recursive: true }).catch(() => {});
    await fs.promises.writeFile(args.mdOut, md, 'utf8');
    process.stdout.write(`Markdown report written to: ${args.mdOut}\n`);
    return;
  }
  if (args.csvOut) {
    const csv = toCsv(results);
    await fs.promises.mkdir(path.dirname(args.csvOut), { recursive: true }).catch(() => {});
    await fs.promises.writeFile(args.csvOut, csv, 'utf8');
    process.stdout.write(`CSV written to: ${args.csvOut}\n`);
    return;
  }
  if (args.json) {
    const payload = { root: rootDir, results, summary };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  for (const item of results) {
    if (args.includeLines && item.comments && item.comments.length) {
      const lineNums = item.comments
        .map((c) => (c.startLine === c.endLine ? `${c.startLine}` : `${c.startLine}-${c.endLine}`))
        .join(',');
      process.stdout.write(`${item.path}:${lineNums}\n`);
    } else {
      process.stdout.write(`${item.path}\n`);
    }
  }
  if (args.counts) {
    process.stdout.write(`\n`);
    process.stdout.write(`Scanned files: ${summary.totalScanned}\n`);
    process.stdout.write(`Matched files: ${summary.totalMatched}\n`);
    for (const [ext, count] of Object.entries(summary.byExtension))
      process.stdout.write(`${ext}: ${count}\n`);
  }
}

module.exports = {
  run,
  runCli,
  parseArgs,
};
