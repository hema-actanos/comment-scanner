## comment-scanner

Scan codebases for comment lines across common languages and web files. Outputs files, JSON, Markdown, or CSV.

### Install (local dev)

```bash
npm install
npm link
```

### CLI

```bash
comment-scanner [options]
```

Options:

- `--root <path>`: Root to scan (default: cwd)
- `--exts <list>`: Comma-separated extensions (defaults shown below)
- `--relative`: Print relative paths
- `--max-size <bytes>`: Skip files larger than this size (default: 5242880)
- `--counts`: Print counts summary
- `--json`: Print JSON payload to stdout
- `--lines`: Include line numbers with stdout list
- `--snippets`: Include comment snippets (for Markdown)
- `--md [path]`: Write Markdown report (default: comment-report.md)
- `--csv [path]`: Write CSV file of file,line_numbers (default: comment-lines.csv)
- `--code-only`: Only include comments that look like commented-out code, not prose
- `--include <dirs>`: Comma-separated directory names to FORCE include (override default ignores)
- `--exclude <dirs>`: Comma-separated directory names to additionally exclude

Examples:

```bash
comment-scanner --relative
comment-scanner --json > comments.json
comment-scanner --md report.md --snippets
comment-scanner --csv lines.csv --exts .vue,.js
comment-scanner --code-only --json > commented-code.json
comment-scanner --include public --exclude vendor,notes --counts
```

### Supported extensions (defaults)

```
.vue,.js,.jsx,.mjs,.cjs,.ts,.tsx,.css,.html,.htm,
.java,.c,.h,.cpp,.cc,.cxx,.hpp,.hh,.hxx,.cs,.py
```

Notes:

- JS/TS/JSX/TSX/C/C++/C#/Java/CSS: supports `// line` and `/* block */` comments.
- HTML/Vue: supports `<!-- block -->` plus JS/CSS styles inside Vue.
- Python: supports `# line` and treats triple-quoted strings as block comments.

### Library

```js
const { run } = require("comment-scanner");
(async () => {
  const { results, summary } = await run({
    root: process.cwd(),
    relative: true,
  });
  console.log(results.length, summary.totalMatched);
})();
```

License: MIT
