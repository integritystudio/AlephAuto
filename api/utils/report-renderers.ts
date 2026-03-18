/**
 * Report rendering helpers for converting Markdown and JSON to styled HTML pages.
 */

import { marked } from 'marked';

export async function convertMarkdownToHTML(content: string, title: string): Promise<string> {
  const rendered = await marked(content);
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1.5rem; color: #1f2937; line-height: 1.6; }
  h1, h2, h3 { color: #111827; margin-top: 1.5em; }
  pre { background: #1e1e1e; color: #d4d4d4; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
  code { font-family: 'Monaco', 'Courier New', monospace; font-size: 0.875em; }
  :not(pre) > code { background: #f3f4f6; padding: 0.125rem 0.375rem; border-radius: 0.25rem; color: #1f2937; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid #d1d5db; padding: 0.5rem 0.75rem; text-align: left; }
  th { background: #f9fafb; font-weight: 600; }
  tr:nth-child(even) { background: #f9fafb; }
  blockquote { border-left: 4px solid #d1d5db; margin: 1rem 0; padding: 0.5rem 1rem; color: #4b5563; }
  a { color: #2563eb; }
</style>
</head><body>${rendered}</body></html>`;
}

export function convertJSONToHTML(content: string, filename: string): string {
  const pretty = JSON.stringify(JSON.parse(content), null, 2);
  const escaped = pretty
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const title = filename.replace(/\.json$/, '');
  const encodedFilename = encodeURIComponent(filename);

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0d1117; color: #e6edf3; font-family: 'Monaco', 'Menlo', 'Courier New', monospace; font-size: 13px; line-height: 1.5; }
  .toolbar { position: sticky; top: 0; z-index: 10; background: #161b22; border-bottom: 1px solid #30363d; padding: 0.5rem 1.5rem; display: flex; align-items: center; gap: 1rem; }
  .toolbar h1 { font-size: 14px; font-weight: 600; color: #8b949e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .toolbar button { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; border-radius: 6px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
  .toolbar button:hover { background: #30363d; border-color: #8b949e; }
  .toolbar a { color: #58a6ff; font-size: 12px; text-decoration: none; }
  .toolbar a:hover { text-decoration: underline; }
  pre { padding: 1.5rem; overflow-x: auto; }
  .json-key { color: #7ee787; }
  .json-string { color: #a5d6ff; }
  .json-number { color: #d2a8ff; }
  .json-bool { color: #ff7b72; }
  .json-null { color: #8b949e; }
</style>
</head><body>
<div class="toolbar">
  <h1>${filename}</h1>
  <button onclick="navigator.clipboard.writeText(document.getElementById('json').textContent)">Copy</button>
  <a href="/api/reports/${encodedFilename}" onclick="event.preventDefault(); fetch(this.href, {headers:{'Accept':'application/json'}}).then(r=>r.text()).then(t=>{const b=new Blob([t],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='${filename}';a.click()})">Download</a>
</div>
<pre id="json">${escaped}</pre>
<script>
  const pre = document.getElementById('json');
  pre.innerHTML = pre.textContent.replace(
    /("(?:[^"\\\\\\\\]|\\\\\\\\.)*")\\s*:/g, '<span class="json-key">$1</span>:'
  ).replace(
    /:\\s*("(?:[^"\\\\\\\\]|\\\\\\\\.)*")/g, ': <span class="json-string">$1</span>'
  ).replace(
    /:\\s*(-?\\d+\\.?\\d*(?:[eE][+-]?\\d+)?)/g, ': <span class="json-number">$1</span>'
  ).replace(
    /:\\s*(true|false)/g, ': <span class="json-bool">$1</span>'
  ).replace(
    /:\\s*(null)/g, ': <span class="json-null">$1</span>'
  );
</script>
</body></html>`;
}
