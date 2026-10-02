import * as http from 'node:http';
import type { ArgusEngine } from '../engine.js';
import type { IndexableDocument } from '../index/types.js';

export interface ServerOptions {
  port?: number;
  host?: string;
}

/**
 * Lightweight, zero-dependency HTTP search server providing a REST API
 * and an embedded browser search dashboard.
 */
export class ArgusServer {
  private readonly engine: ArgusEngine;
  private server: http.Server | null = null;
  private activePort: number = 0;

  constructor(engine: ArgusEngine) {
    this.engine = engine;
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

    // Route: GET / -> Embedded Search Playground UI
    if (method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.renderSearchUI());
      return;
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

    // Route: GET /api/stats
    if (method === 'GET' && pathname === '/api/stats') {
      const stats = this.engine.getStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
      return;
    }

    // Route: POST /api/index
    if (method === 'POST' && pathname === '/api/index') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const doc = JSON.parse(body) as IndexableDocument;
          if (doc && typeof doc.id === 'number') {
            await this.engine.addDocument(doc);
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, docId: doc.id }));
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Document must contain a numerical id field' }));
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
      --bg: #0f172a;
      --card: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --primary: #38bdf8;
      --accent: #818cf8;
      --highlight: #fef08a;
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
      color: #0f172a;
      border: none;
      padding: 0 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
    }
    .query-help {
      font-size: 0.85rem;
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
    .result-snippet {
      font-size: 0.95rem;
      color: #cbd5e1;
      line-height: 1.5;
    }
    .result-snippet b, .result-snippet strong {
      color: #0f172a;
      background: var(--highlight);
      padding: 0.1rem 0.25rem;
      border-radius: 2px;
    }
    .result-meta {
      font-size: 0.8rem;
      color: var(--muted);
      display: flex;
      gap: 0.5rem;
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

    <div class="search-bar">
      <input type="text" id="queryInput" placeholder="Try: distributed AND consensus, &quot;fault tolerance&quot;, distrib*..." autofocus />
      <button onclick="executeSearch()">Search</button>
    </div>

    <div class="query-help">
      Supports Boolean logic (<code>AND</code>, <code>OR</code>, <code>NOT</code>), exact phrases (<code>"byzantine fault tolerance"</code>), prefixes (<code>distrib*</code>), and parentheses (<code>(paxos OR raft) AND consensus</code>).
    </div>

    <div id="meta" style="font-size:0.85rem; color:var(--muted); display:none;"></div>
    <div id="results">
      <div class="empty-state">Type a query above to search with Okapi BM25 relevance ranking.</div>
    </div>
  </div>

  <script>
    const input = document.getElementById('queryInput');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') executeSearch();
    });

    async function executeSearch() {
      const q = input.value.trim();
      if (!q) return;

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

        resultsDiv.innerHTML = data.results.map((item) => {
          const title = (item.fields && item.fields.title) ? item.fields.title : ('Document #' + item.docId);
          const snippetHtml = item.snippet
            ? item.snippet.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
            : 'No snippet available';

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
              </div>
            </div>
          \`;
        }).join('');
      } catch (err) {
        meta.textContent = 'Search failed: ' + err.message;
      }
    }
  </script>
</body>
</html>`;
  }
}
