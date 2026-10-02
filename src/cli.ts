import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { ArgusEngine } from './engine.js';
import { ArgusServer } from './server/server.js';
import { readIndexHeader } from './storage/deserializer.js';
import type { IndexableDocument } from './index/types.js';
import { DEFAULT_STOP_WORDS } from './analyzer/stop-words.js';

interface CliArgs {
  command: string;
  source?: string;
  output?: string;
  index?: string;
  query?: string;
  port?: number;
  limit?: number;
  help?: boolean;
}

const KNOWN_COMMANDS = new Set(['index', 'search', 'stats', 'serve', 'watch', 'help']);

/**
 * Searches for an existing .argus binary index in the current directory.
 */
export function autoDetectIndex(specifiedPath?: string): string | null {
  if (specifiedPath) {
    const resolved = path.resolve(specifiedPath);
    return fs.existsSync(resolved) ? resolved : null;
  }

  // Scan current directory for *.argus files and pick the most recently modified
  try {
    const cwd = process.cwd();
    const files = fs.readdirSync(cwd);
    const argusFiles = files
      .filter((f) => f.endsWith('.argus'))
      .map((f) => {
        try {
          const full = path.join(cwd, f);
          const stat = fs.statSync(full);
          return { path: full, mtime: stat.mtimeMs };
        } catch {
          return null;
        }
      })
      .filter((entry): entry is { path: string; mtime: number } => entry !== null)
      .sort((a, b) => b.mtime - a.mtime);

    if (argusFiles.length > 0) {
      return argusFiles[0]!.path;
    }
  } catch {
    // Ignore directory scan errors
  }

  const commonNames = ['index.argus', 'library.argus', 'docs.argus'];
  for (const name of commonNames) {
    const candidate = path.resolve(name);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

export function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    command: '',
  };

  const positional: string[] = [];
  let i = 0;

  while (i < args.length) {
    const arg = args[i]!;

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--source' && i + 1 < args.length) {
      result.source = args[++i];
    } else if (arg === '--output' && i + 1 < args.length) {
      result.output = args[++i];
    } else if (arg === '--index' && i + 1 < args.length) {
      result.index = args[++i];
    } else if (arg === '--port' && i + 1 < args.length) {
      result.port = parseInt(args[++i]!, 10);
    } else if (arg === '--limit' && i + 1 < args.length) {
      result.limit = parseInt(args[++i]!, 10);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }

    i++;
  }

  if (positional.length > 0) {
    const first = positional[0]!;
    if (KNOWN_COMMANDS.has(first.toLowerCase())) {
      result.command = first.toLowerCase();
      // Handle remaining positional args based on command
      if (result.command === 'index') {
        if (!result.source && positional[1]) result.source = positional[1];
        if (!result.output && positional[2]) result.output = positional[2];
      } else if (result.command === 'search') {
        if (!result.query && positional[1]) result.query = positional.slice(1).join(' ');
      } else if (result.command === 'serve') {
        if (!result.port && positional[1] && !isNaN(Number(positional[1]))) {
          result.port = parseInt(positional[1], 10);
        }
      } else if (result.command === 'stats') {
        if (!result.index && positional[1]) result.index = positional[1];
      } else if (result.command === 'watch') {
        if (!result.source && positional[1]) result.source = positional[1];
        if (!result.output && positional[2]) result.output = positional[2];
      }
    } else {
      // Shorthand: running `argus "search query"` directly defaults to search
      result.command = 'search';
      result.query = positional.join(' ');
    }
  }

  return result;
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  if (args.help) {
    printHelp();
    return;
  }

  // Zero-config default: running `argus` with no arguments starts the server & UI!
  if (!args.command) {
    console.log('🚀 No command specified. Starting Argus Web UI & Search Server...');
    await handleServe(args);
    return;
  }

  switch (args.command) {
    case 'index':
      await handleIndex(args);
      break;
    case 'search':
      await handleSearch(args);
      break;
    case 'stats':
      await handleStats(args);
      break;
    case 'serve':
      await handleServe(args);
      break;
    case 'watch':
      await handleWatch(args);
      break;
    default:
      console.error(`Unknown command: ${args.command}`);
      printHelp();
      process.exitCode = 1;
      break;
  }
}

async function handleIndex(args: CliArgs): Promise<void> {
  // Smart default: source defaults to './', output defaults to './index.argus'
  const sourceInput = args.source ?? './';
  const sourcePath = path.resolve(sourceInput);

  let outputInput = args.output;
  if (!outputInput) {
    const isFile = fs.existsSync(sourcePath) && fs.statSync(sourcePath).isFile();
    const base = isFile
      ? path.basename(sourcePath, path.extname(sourcePath))
      : path.basename(sourcePath);
    outputInput = base && base !== '.' ? `./${base}.argus` : './index.argus';
  }
  const outputPath = path.resolve(outputInput);

  if (!fs.existsSync(sourcePath)) {
    console.error(`Error: Source path does not exist: ${sourcePath}`);
    process.exitCode = 1;
    return;
  }

  console.log(`🔍 Indexing files from: ${sourcePath}`);
  const startTime = performance.now();

  const documents = await collectDocuments(sourcePath);
  if (documents.length === 0) {
    console.warn(`Warning: No .json, .md, or .txt documents found in ${sourcePath}`);
    return;
  }

  const engine = new ArgusEngine();
  await engine.addDocuments(documents);
  await engine.commit(outputPath);

  const elapsedMs = (performance.now() - startTime).toFixed(1);
  const fileStats = fs.statSync(outputPath);
  const sizeKb = (fileStats.size / 1024).toFixed(2);

  console.log(`✅ Indexed ${documents.length} document(s) in ${elapsedMs}ms`);
  console.log(`💾 Index saved to: ${outputPath} (${sizeKb} KB)`);
  console.log(`\n💡 Tip: Run 'argus search "your query"' or 'argus serve' to test.`);
}

async function handleSearch(args: CliArgs): Promise<void> {
  if (!args.query) {
    console.error('Error: Please provide a search query.');
    console.error('Usage: argus search "distributed consensus"');
    process.exitCode = 1;
    return;
  }

  // Auto-detect index file if not specified
  const detectedIndex = autoDetectIndex(args.index);
  if (!detectedIndex) {
    console.error('Error: No index file found.');
    console.error('Please index documents first: argus index ./your-folder');
    process.exitCode = 1;
    return;
  }

  const engine = await ArgusEngine.load(detectedIndex);
  const limit = args.limit ?? 10;

  const startTime = performance.now();
  const results = engine.search(args.query, { limit });
  const elapsedMs = (performance.now() - startTime).toFixed(2);

  console.log(`\n🔎 Query: "${args.query}" (Index: ${path.basename(detectedIndex)}) — ${results.length} result(s) in ${elapsedMs}ms\n`);

  if (results.length === 0) {
    console.log('No matching documents found.');

    const rawTerms = args.query.toLowerCase().match(/[a-z0-9_]+/g) || [];
    if (rawTerms.length > 0 && rawTerms.every((t) => DEFAULT_STOP_WORDS.has(t))) {
      console.log(`\n\x1b[33m💡 Note: "${args.query}" consists of common English stop word(s) filtered out during indexing.\x1b[0m`);
      console.log('\x1b[2m   Argus removes high-frequency grammatical words (e.g. "where", "the", "what", "is") to optimize BM25 relevance scoring.\x1b[0m');
      console.log('\x1b[2m   Try searching for content-specific terms (e.g. keywords, names, technologies).\x1b[0m');
    }
    return;
  }

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const title = (r.fields && (r.fields['title'] as string)) || `Document #${r.docId}`;
    console.log(`\x1b[1;36m${i + 1}.\x1b[0m [\x1b[32mBM25: ${r.score.toFixed(4)}\x1b[0m] \x1b[1m${title}\x1b[0m (DocID: ${r.docId})`);
    if (r.snippet) {
      const colored = r.snippet.replace(/\*\*(.*?)\*\*/g, '\x1b[1;33m$1\x1b[0m');
      console.log(`   ${colored}`);
    }
    if (r.matchedTerms && r.matchedTerms.length > 0) {
      console.log(`   \x1b[2mMatched: ${r.matchedTerms.join(', ')}\x1b[0m`);
    }
    console.log('');
  }
}

async function handleStats(args: CliArgs): Promise<void> {
  const detectedIndex = autoDetectIndex(args.index);
  if (!detectedIndex) {
    console.error('Error: No index file found in current directory.');
    console.error('Usage: argus stats [path/to/file.argus]');
    process.exitCode = 1;
    return;
  }

  const buffer = await fs.promises.readFile(detectedIndex);
  const header = readIndexHeader(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  const fileSizeKb = (header.totalFileSize / 1024).toFixed(2);

  console.log(`\n📊 Argus Index Statistics (${path.basename(detectedIndex)})`);
  console.log('───────────────────────────────────────');
  console.log(`Format Version:       v${header.version}`);
  console.log(`Total Documents (N):  ${header.totalDocuments}`);
  console.log(`Unique Lexicon Terms: ${header.termCount}`);
  console.log(`Total Tokens:         ${header.totalTokens}`);
  console.log(`Average Doc Length:   ${header.averageDocLength.toFixed(2)} tokens`);
  console.log(`File Size:            ${fileSizeKb} KB (${header.totalFileSize} bytes)`);
  console.log('───────────────────────────────────────\n');
}

async function handleServe(args: CliArgs): Promise<void> {
  const detectedIndex = autoDetectIndex(args.index);
  let engine: ArgusEngine;
  let activeIndexPath: string | undefined;

  if (detectedIndex) {
    console.log(`Loading index from ${path.basename(detectedIndex)}...`);
    engine = await ArgusEngine.load(detectedIndex);
    activeIndexPath = detectedIndex;
  } else {
    console.log('No existing index found. Starting fresh search engine...');
    console.log('💡 Tip: You can drag and drop documents directly onto the Web UI to index them!\n');
    activeIndexPath = path.resolve('./index.argus');
    engine = new ArgusEngine();
  }

  const server = new ArgusServer(engine, activeIndexPath);
  const port = args.port ?? 8080;
  const activePort = await server.start({ port });

  console.log(`\n🚀 Argus Search Server running!`);
  console.log(`🌐 Web UI & Playground: http://localhost:${activePort}`);
  console.log(`📡 REST API Endpoint:   http://localhost:${activePort}/api/search?q=your_query`);
  console.log(`📊 Index Stats:         http://localhost:${activePort}/api/stats\n`);
  console.log(`Press Ctrl+C to stop the server.`);
}

async function handleWatch(args: CliArgs): Promise<void> {
  const sourceInput = args.source ?? './';
  const sourcePath = path.resolve(sourceInput);
  let outputInput = args.output;
  if (!outputInput) {
    const base = path.basename(sourcePath);
    outputInput = base && base !== '.' ? `./${base}.argus` : './index.argus';
  }
  const outputPath = path.resolve(outputInput);

  console.log(`\n👀 [Argus Live Watch Mode]`);
  console.log(`📁 Source directory: ${sourcePath}`);
  console.log(`💾 Live target index: ${outputPath}\n`);

  // Initial build
  await handleIndex(args);

  console.log(`⚡ Actively watching for file edits. Press Ctrl+C to stop.`);

  let debounceTimer: NodeJS.Timeout | null = null;
  fs.watch(sourcePath, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    const lower = filename.toLowerCase();
    if (lower.endsWith('.argus') || lower.endsWith('.wal') || lower.includes('node_modules') || lower.includes('.git')) {
      return;
    }

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      console.log(`\n🔄 [${eventType}] Detected change in: ${filename}`);
      const start = performance.now();
      try {
        const documents = await collectDocuments(sourcePath);
        const engine = new ArgusEngine();
        await engine.addDocuments(documents);
        await engine.commit(outputPath);
        const elapsed = (performance.now() - start).toFixed(1);
        console.log(`⚡ Re-indexed ${documents.length} document(s) in ${elapsed}ms!`);
      } catch (err: any) {
        console.error('Failed to update index:', err.message);
      }
    }, 250);
  });
}

const SUPPORTED_TEXT_EXTS = new Set([
  '.txt', '.md', '.markdown', '.rst', '.csv', '.tsv', '.log',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.hpp',
  '.cs', '.rb', '.php', '.swift', '.kt',
  '.html', '.css', '.scss', '.yaml', '.yml', '.toml', '.sql',
  '.sh', '.bash', '.zsh', '.env'
]);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target',
  '.next', '.nuxt', '.turbo', '__pycache__', '.venv', 'venv',
  '.idea', '.vscode', '.cache', '.argus'
]);

/**
 * Extracts plain text from Microsoft Office OpenXML files (.pptx slides, .docx document).
 * Uses Node's built-in zlib for zero-dependency zip parsing.
 */
function extractOfficeXmlText(buffer: Buffer, filePattern: RegExp): string {
  let pos = 0;
  const texts: string[] = [];
  while (pos < buffer.length - 30) {
    if (buffer.readUInt32LE(pos) === 0x04034b50) {
      const method = buffer.readUInt16LE(pos + 8);
      const compSize = buffer.readUInt32LE(pos + 18);
      const nameLen = buffer.readUInt16LE(pos + 26);
      const extraLen = buffer.readUInt16LE(pos + 28);
      const name = buffer.subarray(pos + 30, pos + 30 + nameLen).toString('utf-8');
      const dataStart = pos + 30 + nameLen + extraLen;

      if (filePattern.test(name)) {
        const compressed = buffer.subarray(dataStart, dataStart + compSize);
        try {
          const raw = method === 8 ? zlib.inflateRawSync(compressed) : compressed;
          const xml = raw.toString('utf-8');
          const cleanText = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          if (cleanText.length > 0) texts.push(cleanText);
        } catch {
          // ignore stream parse errors
        }
      }
      pos = dataStart + compSize;
    } else {
      pos++;
    }
  }
  return texts.join(' ');
}

async function collectDocuments(targetPath: string): Promise<IndexableDocument[]> {
  const documents: IndexableDocument[] = [];
  let nextDocId = 1;

  async function walk(dirOrFile: string): Promise<void> {
    const stat = await fs.promises.stat(dirOrFile);

    if (stat.isFile()) {
      if (stat.size > 20 * 1024 * 1024) return; // Skip files > 20MB

      const ext = path.extname(dirOrFile).toLowerCase();

      if (ext === '.pptx') {
        try {
          const buffer = await fs.promises.readFile(dirOrFile);
          const slideText = extractOfficeXmlText(buffer, /ppt\/slides\/slide\d+\.xml/i);
          if (slideText.length > 0) {
            const relPath = path.relative(targetPath, dirOrFile) || path.basename(dirOrFile);
            documents.push({
              id: nextDocId++,
              title: relPath,
              body: slideText,
            });
          }
        } catch {
          // Skip unreadable PPTX
        }
      } else if (ext === '.docx') {
        try {
          const buffer = await fs.promises.readFile(dirOrFile);
          const docText = extractOfficeXmlText(buffer, /word\/document\.xml/i);
          if (docText.length > 0) {
            const relPath = path.relative(targetPath, dirOrFile) || path.basename(dirOrFile);
            documents.push({
              id: nextDocId++,
              title: relPath,
              body: docText,
            });
          }
        } catch {
          // Skip unreadable DOCX
        }
      } else if (ext === '.json') {
        try {
          const content = await fs.promises.readFile(dirOrFile, 'utf-8');
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              documents.push({
                id: typeof item.id === 'number' ? item.id : nextDocId++,
                ...item,
              });
            }
          } else if (typeof parsed === 'object' && parsed !== null) {
            documents.push({
              id: typeof parsed.id === 'number' ? parsed.id : nextDocId++,
              ...parsed,
            });
          }
        } catch {
          // Skip invalid JSON
        }
      } else if (SUPPORTED_TEXT_EXTS.has(ext)) {
        try {
          const content = await fs.promises.readFile(dirOrFile, 'utf-8');
          if (content.includes('\0')) return; // Skip binary files

          const relPath = path.relative(targetPath, dirOrFile) || path.basename(dirOrFile);
          documents.push({
            id: nextDocId++,
            title: relPath,
            body: content,
          });
        } catch {
          // Skip unreadable files
        }
      }
    } else if (stat.isDirectory()) {
      const dirName = path.basename(dirOrFile);
      if (IGNORED_DIRS.has(dirName) || (dirName.startsWith('.') && dirName !== '.' && dirName !== '..')) {
        return;
      }

      const entries = await fs.promises.readdir(dirOrFile);
      for (const entry of entries) {
        if (!entry.startsWith('.') && !IGNORED_DIRS.has(entry)) {
          await walk(path.join(dirOrFile, entry));
        }
      }
    }
  }

  await walk(targetPath);
  return documents;
}

function printHelp(): void {
  console.log(`
🚀 Argus — High-Performance Full-Text Search Engine

DEAD SIMPLE USAGE:
  argus                         Start the Web UI immediately at http://localhost:8080
  argus index <folder>          Index any folder of documents/code (e.g. 'argus index ./src')
  argus watch <folder>          Watch folder and auto re-index on file changes
  argus search "<query>"        Search your documents (e.g. 'argus search "consensus"')
  argus "<query>"               Direct search shorthand (e.g. 'argus "machine learning"')
  argus stats                   View index statistics
  argus serve [port]            Start web UI / API server (default: port 8080)

SEARCH SYNTAX:
  Exact phrases:                "byzantine fault tolerance"
  Boolean expressions:          distributed AND (consensus OR raft) NOT centralized
  Prefix / Wildcards:           distrib*
  Typo tolerance (fuzzy):       computr~ or algoritm~1

OPTIONS:
  --source <path>               Folder or file to index
  --output <file.argus>         Custom target output index path
  --index <file.argus>          Specify which index file to use (auto-detected if omitted)
  --limit <number>              Maximum search results to display (default: 10)
  --port <number>               Web server port (default: 8080)
  --help, -h                    Show this help message

EXAMPLES:
  argus index ./notes           (Indexes ./notes into ./notes.argus)
  argus watch ./notes           (Auto re-indexes whenever files are modified)
  argus "fault tolerance"       (Searches for exact phrase)
  argus serve 3000              (Starts Web UI on port 3000)
`);
}

// Auto-run if executed directly as entrypoint
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  runCli();
}
