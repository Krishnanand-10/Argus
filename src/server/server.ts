import * as http from 'node:http';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ArgusEngine } from '../engine.js';
import type { IndexableDocument } from '../index/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerOptions {
  port?: number;
  host?: string;
  indexPath?: string;
}

/**
 * Lightweight, zero-dependency HTTP search server providing a REST API,
 * dynamic document uploads, and an embedded browser search dashboard.
 */
export class ArgusServer {
  private readonly engine: ArgusEngine;
  private readonly indexPath?: string;
  private server: http.Server | null = null;
  private activePort: number = 0;

  constructor(engine: ArgusEngine, indexPath?: string) {
    this.engine = engine;
    this.indexPath = indexPath;
  }

  /**
   * Starts the HTTP server.
   */
  public async start(options: ServerOptions = {}): Promise<number> {
    const port = options.port ?? 8080;
    const host = options.host ?? '0.0.0.0';

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    return new Promise<number>((resolve, reject) => {
      this.server!.listen(port, host, () => {
        const address = this.server!.address();
        if (address && typeof address === 'object') {
          this.activePort = address.port;
          resolve(this.activePort);
        } else {
          resolve(port);
        }
      });
      this.server!.on('error', (err) => reject(err));
    });
  }

  /**
   * Stops the HTTP server.
   */
  public async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise<void>((resolve) => {
      this.server!.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  public get port(): number {
    return this.activePort;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const pathname = parsedUrl.pathname;
    const method = req.method?.toUpperCase() || 'GET';

    // CORS headers for API consumers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Route: Static files (index.html, playground.html, styles.css, app.js, playground.js) or fallback UI
    const staticRoutes: Record<string, string> = {
      '/': 'index.html',
      '/index.html': 'index.html',
      '/playground': 'playground.html',
      '/playground.html': 'playground.html',
      '/repl': 'playground.html',
      '/styles.css': 'styles.css',
      '/app.js': 'app.js',
      '/playground.js': 'playground.js',
    };

    if (method === 'GET' && staticRoutes[pathname]) {
      const fileName = staticRoutes[pathname];
      const candidates = [
        path.resolve(process.cwd(), fileName),
        path.resolve(__dirname, '../../', fileName),
        path.resolve(__dirname, '../', fileName),
      ];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          const ext = path.extname(candidate).toLowerCase();
          const mimeTypes: Record<string, string> = {
            '.html': 'text/html; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
          };
          res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
          res.end(fs.readFileSync(candidate));
          return;
        }
      }

      if (fileName === 'index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.renderSearchUI());
        return;
      }
    }

    // Route: GET /api/search?q=...&limit=...
    if (method === 'GET' && pathname === '/api/search') {
      const q = parsedUrl.searchParams.get('q') || '';
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '10', 10);

      const startTime = performance.now();
      const results = this.engine.search(q, { limit });
      const elapsedMs = +(performance.now() - startTime).toFixed(2);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          query: q,
          totalResults: results.length,
          executionTimeMs: elapsedMs,
          results,
        })
      );
      return;
    }

    // Route: GET /api/suggest?q=...&limit=...
    if (method === 'GET' && pathname === '/api/suggest') {
      const q = parsedUrl.searchParams.get('q') || '';
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '5', 10);
      const suggestions = q.length > 0 ? this.engine.suggest(q, limit) : [];

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ query: q, suggestions }));
      return;
    }

    // Route: GET /api/stats
    if (method === 'GET' && pathname === '/api/stats') {
      const stats = this.engine.getStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
      return;
    }

    // Route: GET /api/documents -> List all indexed documents
    if (method === 'GET' && pathname === '/api/documents') {
      const documents = this.engine.invertedIndex.getAllDocuments();
      const stats = this.engine.getStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ documents, stats }));
      return;
    }

    // Route: POST /api/upload -> Batch upload documents from browser
    if (method === 'POST' && pathname === '/api/upload') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body) as { files: Array<{ name: string; content: string }> };
          if (!payload.files || !Array.isArray(payload.files)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Expected { files: Array<{ name, content }> }' }));
            return;
          }

          const existingDocs = this.engine.invertedIndex.getAllDocuments();
          let nextId = existingDocs.reduce((max, d) => Math.max(max, d.id), 0) + 1;
          const documentsToIndex: IndexableDocument[] = [];

          for (const file of payload.files) {
            const ext = path.extname(file.name).toLowerCase();
            if (ext === '.json') {
              try {
                const parsed = JSON.parse(file.content);
                if (Array.isArray(parsed)) {
                  for (const item of parsed) {
                    documentsToIndex.push({
                      id: typeof item.id === 'number' ? item.id : nextId++,
                      ...item,
                    });
                  }
                } else if (typeof parsed === 'object' && parsed !== null) {
                  documentsToIndex.push({
                    id: typeof parsed.id === 'number' ? parsed.id : nextId++,
                    ...parsed,
                  });
                }
              } catch {
                documentsToIndex.push({
                  id: nextId++,
                  title: file.name,
                  body: file.content,
                });
              }
            } else {
              documentsToIndex.push({
                id: nextId++,
                title: file.name,
                body: file.content,
              });
            }
          }

          await this.engine.addDocuments(documentsToIndex);

          // Auto-persist if indexPath is known
          if (this.indexPath) {
            await this.engine.commit(this.indexPath);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              addedCount: documentsToIndex.length,
              stats: this.engine.getStats(),
            })
          );
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message || 'Upload failed' }));
        }
      });
      return;
    }

    // Route: POST /api/index -> Single document indexing
    if (method === 'POST' && pathname === '/api/index') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const doc = JSON.parse(body) as Partial<IndexableDocument>;
          if (doc && typeof doc === 'object') {
            const existingDocs = this.engine.invertedIndex.getAllDocuments();
            const nextId = existingDocs.reduce((max, d) => Math.max(max, d.id), 0) + 1;
            const fullDoc: IndexableDocument = {
              id: typeof doc.id === 'number' ? doc.id : nextId,
              title: doc.title || 'Untitled Document',
              body: doc.body || '',
              path: doc.path,
              tags: doc.tags,
            };
            await this.engine.addDocument(fullDoc);
            if (this.indexPath) {
              await this.engine.commit(this.indexPath);
            }
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, docId: fullDoc.id, stats: this.engine.getStats() }));
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Document must be an object' }));
          }
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message || 'Invalid JSON' }));
        }
      });
      return;
    }

    // 404 Not Found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }

  private renderSearchUI(): string {
    const stats = this.engine.getStats();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Argus — Full-Text Search Playground</title>
  <style>
    :root {
      --bg: #0b1120;
      --card: #1e293b;
      --card-hover: #24344d;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --primary: #38bdf8;
      --accent: #818cf8;
      --highlight: #fef08a;
      --success: #34d399;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 2rem 1rem;
      display: flex;
      justify-content: center;
    }
    .container {
      width: 100%;
      max-width: 860px;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1rem;
    }
    h1 {
      font-size: 1.8rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: linear-gradient(135deg, var(--primary), var(--accent));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .stats-badges {
      display: flex;
      gap: 0.75rem;
      font-size: 0.85rem;
    }
    .badge {
      background: var(--card);
      border: 1px solid var(--border);
      padding: 0.35rem 0.75rem;
      border-radius: 9999px;
      color: var(--muted);
    }
    .badge b { color: var(--text); }
    
    /* Upload Zone */
    .upload-box {
      border: 2px dashed var(--border);
      background: rgba(30, 41, 59, 0.4);
      border-radius: 12px;
      padding: 1.25rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.4rem;
    }
    .upload-box:hover, .upload-box.dragover {
      border-color: var(--primary);
      background: rgba(56, 189, 248, 0.08);
    }
    .upload-icon {
      font-size: 1.7rem;
    }
    .upload-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text);
    }
    .upload-sub {
      font-size: 0.8rem;
      color: var(--muted);
    }
    .upload-status {
      font-size: 0.85rem;
      color: var(--success);
      margin-top: 0.25rem;
      display: none;
    }

    /* Search Bar */
    .search-bar {
      display: flex;
      gap: 0.5rem;
    }
    input[type="text"] {
      flex: 1;
      background: var(--card);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 0.85rem 1.25rem;
      border-radius: 8px;
      font-size: 1.05rem;
      outline: none;
      transition: border-color 0.2s;
    }
    input[type="text"]:focus {
      border-color: var(--primary);
    }
    button {
      background: linear-gradient(135deg, var(--primary), var(--accent));
      color: #0b1120;
      border: none;
      padding: 0 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
    }
    .query-help {
      font-size: 0.82rem;
      color: var(--muted);
      line-height: 1.4;
    }
    .query-help code {
      background: var(--card);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      color: var(--primary);
    }
    #results {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .result-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .result-title {
      font-size: 1.15rem;
      font-weight: 600;
      color: var(--primary);
    }
    .result-score {
      font-size: 0.8rem;
      background: #0284c7;
      color: white;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-family: monospace;
    }
    .suggest-container {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.82rem;
      color: var(--muted);
      flex-wrap: wrap;
      min-height: 1.2rem;
    }
    .suggest-chip {
      background: var(--card);
      border: 1px solid var(--border);
      color: var(--primary);
      padding: 0.15rem 0.55rem;
      border-radius: 9999px;
      cursor: pointer;
      font-size: 0.78rem;
      transition: all 0.15s ease;
    }
    .suggest-chip:hover {
      background: rgba(56, 189, 248, 0.15);
      border-color: var(--primary);
    }
    .result-snippet {
      font-size: 0.95rem;
      color: #cbd5e1;
      line-height: 1.5;
    }
    .result-snippet b, .result-snippet strong {
      color: #f59e0b;
      background: rgba(245, 158, 11, 0.18);
      border-bottom: 2px solid rgba(245, 158, 11, 0.6);
      padding: 0.05rem 0.3rem;
      border-radius: 4px;
      font-weight: 600;
    }
    .result-meta {
      font-size: 0.8rem;
      color: var(--muted);
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }
    .details-toggle {
      background: none;
      border: none;
      color: var(--primary);
      cursor: pointer;
      font-size: 0.8rem;
      padding: 0;
      text-decoration: underline;
    }
    .full-doc-view {
      margin-top: 0.5rem;
      padding: 0.75rem;
      background: #0b1120;
      border-radius: 6px;
      border: 1px solid var(--border);
      font-family: monospace;
      font-size: 0.8rem;
      color: #94a3b8;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 250px;
      overflow-y: auto;
      display: none;
    }
    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🚀 Argus Search</h1>
      <div class="stats-badges">
        <div class="badge">Docs: <b id="stat-docs">${stats.totalDocuments}</b></div>
        <div class="badge">Terms: <b id="stat-terms">${stats.totalTerms}</b></div>
        <div class="badge">AvgDL: <b id="stat-avgdl">${stats.averageDocLength.toFixed(1)}</b></div>
      </div>
    </header>

    <!-- Drag & Drop Uploader -->
    <div class="upload-box" id="dropZone" onclick="document.getElementById('fileInput').click()">
      <div class="upload-icon">📂</div>
      <div class="upload-title">Drop your documents here, or click to browse</div>
      <div class="upload-sub">Supports Markdown (.md), Plaintext (.txt), JSON (.json), and Code</div>
      <div class="upload-status" id="uploadStatus"></div>
      <input type="file" id="fileInput" multiple style="display:none;" />
    </div>

    <!-- Search Bar -->
    <div class="search-bar">
      <input type="text" id="queryInput" placeholder="Search: consensus, &quot;virtual memory&quot;, distrib*, database NOT relational..." autofocus />
      <button onclick="executeSearch()">Search</button>
    </div>

    <!-- Live Autocomplete Suggestion Chips -->
    <div class="suggest-container" id="suggestBox"></div>

    <div class="query-help">
      Supports Boolean (<code>AND</code>, <code>OR</code>, <code>NOT</code>), exact phrases (<code>"byzantine fault tolerance"</code>), prefixes (<code>distrib*</code>), fuzzy typos (<code>computr~</code>), and grouping. Press <kbd style="background:var(--card); padding:0.1rem 0.3rem; border-radius:3px; border:1px solid var(--border);">/</kbd> to focus.
    </div>

    <div id="meta" style="font-size:0.85rem; color:var(--muted); display:none;"></div>
    <div id="results">
      <div class="empty-state">Type a query above to search your indexed documents.</div>
    </div>
  </div>

  <script>
    const input = document.getElementById('queryInput');
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const uploadStatus = document.getElementById('uploadStatus');
    const suggestBox = document.getElementById('suggestBox');

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') executeSearch();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== input) {
        e.preventDefault();
        input.focus();
      }
      if (e.key === 'Escape' && document.activeElement === input) {
        input.blur();
      }
    });

    let debounceTimer;
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = input.value.trim();
      if (q.length < 2) {
        suggestBox.innerHTML = '';
        return;
      }
      debounceTimer = setTimeout(async () => {
        try {
          const lastWord = q.split(/\\s+/).pop() || '';
          if (lastWord.length < 2 || lastWord.includes('*') || lastWord.includes('"')) {
            suggestBox.innerHTML = '';
            return;
          }
          const res = await fetch('/api/suggest?q=' + encodeURIComponent(lastWord) + '&limit=4');
          const data = await res.json();
          if (data.suggestions && data.suggestions.length > 0) {
            suggestBox.innerHTML =
              '<span style="font-size:0.75rem;">Suggestions:</span> ' +
              data.suggestions.map(s => \`<span class="suggest-chip" onclick="applySuggestion('\${s}')">\${s}</span>\`).join('');
          } else {
            suggestBox.innerHTML = '';
          }
        } catch {}
      }, 100);
    });

    function applySuggestion(term) {
      const words = input.value.trim().split(/\\s+/);
      words[words.length - 1] = term;
      input.value = words.join(' ') + ' ';
      suggestBox.innerHTML = '';
      input.focus();
      executeSearch();
    }

    // Drag and Drop Handling
    ['dragenter', 'dragover'].forEach(event => {
      dropZone.addEventListener(event, (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(event => {
      dropZone.addEventListener(event, (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) handleFiles(files);
    });

    fileInput.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files && files.length > 0) handleFiles(files);
    });

    async function handleFiles(fileList) {
      uploadStatus.style.display = 'block';
      uploadStatus.style.color = 'var(--primary)';
      uploadStatus.textContent = 'Reading and indexing ' + fileList.length + ' file(s)...';

      const filePayloads = [];
      for (const file of fileList) {
        try {
          const text = await file.text();
          filePayloads.push({ name: file.name, content: text });
        } catch (err) {
          console.error('Failed to read file:', file.name, err);
        }
      }

      if (filePayloads.length === 0) {
        uploadStatus.textContent = 'Failed to read any valid files.';
        return;
      }

      try {
        const start = performance.now();
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: filePayloads })
        });
        const data = await res.json();
        const elapsed = (performance.now() - start).toFixed(0);

        if (data.success) {
          uploadStatus.style.color = 'var(--success)';
          uploadStatus.textContent = '✅ Indexed ' + data.addedCount + ' document(s) in ' + elapsed + 'ms! You can now search them below.';
          // Update stats badges
          document.getElementById('stat-docs').textContent = data.stats.totalDocuments;
          document.getElementById('stat-terms').textContent = data.stats.totalTerms;
          document.getElementById('stat-avgdl').textContent = data.stats.averageDocLength.toFixed(1);
        } else {
          uploadStatus.style.color = '#f87171';
          uploadStatus.textContent = 'Error: ' + data.error;
        }
      } catch (err) {
        uploadStatus.style.color = '#f87171';
        uploadStatus.textContent = 'Upload failed: ' + err.message;
      }
    }

    async function executeSearch() {
      const q = input.value.trim();
      if (!q) return;

      suggestBox.innerHTML = '';
      const meta = document.getElementById('meta');
      const resultsDiv = document.getElementById('results');

      meta.style.display = 'block';
      meta.textContent = 'Searching...';

      try {
        const res = await fetch('/api/search?q=' + encodeURIComponent(q) + '&limit=15');
        const data = await res.json();

        meta.textContent = 'Found ' + data.totalResults + ' document(s) in ' + data.executionTimeMs + 'ms';

        if (data.results.length === 0) {
          resultsDiv.innerHTML = '<div class="empty-state">No matching documents found.</div>';
          return;
        }

        resultsDiv.innerHTML = data.results.map((item, idx) => {
          const title = (item.fields && item.fields.title) ? item.fields.title : ('Document #' + item.docId);
          const snippetHtml = item.snippet
            ? item.snippet.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
            : 'No snippet available';

          const docJson = item.fields ? JSON.stringify(item.fields, null, 2) : 'No stored fields';

          return \`
            <div class="result-card">
              <div class="result-header">
                <div class="result-title">\${title}</div>
                <div class="result-score">BM25: \${item.score.toFixed(4)}</div>
              </div>
              <div class="result-snippet">\${snippetHtml}</div>
              <div class="result-meta">
                <span>DocID: \${item.docId}</span>
                \${item.matchedTerms && item.matchedTerms.length ? '<span>Matched: ' + item.matchedTerms.join(', ') + '</span>' : ''}
                <button class="details-toggle" onclick="toggleDetails(\${idx})">View Document</button>
              </div>
              <pre class="full-doc-view" id="doc-view-\${idx}">\${docJson}</pre>
            </div>
          \`;
        }).join('');
      } catch (err) {
        meta.textContent = 'Search failed: ' + err.message;
      }
    }

    function toggleDetails(idx) {
      const el = document.getElementById('doc-view-' + idx);
      if (el) {
        el.style.display = el.style.display === 'block' ? 'none' : 'block';
      }
    }
  </script>
</body>
</html>`;
  }
}
