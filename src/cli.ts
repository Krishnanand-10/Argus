import * as fs from 'node:fs';
import * as path from 'node:path';
import { ArgusEngine } from './engine.js';
import { ArgusServer } from './server/server.js';
import { readIndexHeader } from './storage/deserializer.js';
import type { IndexableDocument } from './index/types.js';

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

export function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    command: '',
  };

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
      if (!result.command) {
        result.command = arg;
      } else if (!result.query) {
        result.query = arg;
      }
    }

    i++;
  }

  return result;
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  if (args.help || !args.command) {
    printHelp();
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
    default:
      console.error(`Unknown command: ${args.command}`);
      printHelp();
      process.exitCode = 1;
      break;
  }
}

async function handleIndex(args: CliArgs): Promise<void> {
  if (!args.source || !args.output) {
    console.error('Error: index command requires both --source and --output flags.');
    console.error('Usage: argus index --source ./docs --output ./indices/docs.argus');
    process.exitCode = 1;
    return;
  }

  const sourcePath = path.resolve(args.source);
  const outputPath = path.resolve(args.output);

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

  console.log(`✅ Successfully indexed ${documents.length} document(s) in ${elapsedMs}ms`);
  console.log(`💾 Serialized .argus binary index: ${outputPath} (${sizeKb} KB)`);
}

async function handleSearch(args: CliArgs): Promise<void> {
  if (!args.index || !args.query) {
    console.error('Error: search command requires both --index and a search query.');
    console.error('Usage: argus search --index ./indices/docs.argus "distributed consensus"');
    process.exitCode = 1;
    return;
  }

  const indexPath = path.resolve(args.index);
  if (!fs.existsSync(indexPath)) {
    console.error(`Error: Index file does not exist: ${indexPath}`);
    process.exitCode = 1;
    return;
  }

  const engine = await ArgusEngine.load(indexPath);
  const limit = args.limit ?? 10;

  const startTime = performance.now();
  const results = engine.search(args.query, { limit });
  const elapsedMs = (performance.now() - startTime).toFixed(2);

  console.log(`\n🔎 Query: "${args.query}" — ${results.length} result(s) in ${elapsedMs}ms\n`);

  if (results.length === 0) {
    console.log('No matching documents found.');
    return;
  }

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const title = (r.fields && (r.fields['title'] as string)) || `Document #${r.docId}`;
    console.log(`${i + 1}. [BM25: ${r.score.toFixed(4)}] ${title} (DocID: ${r.docId})`);
    if (r.snippet) {
      console.log(`   ${r.snippet}`);
    }
    console.log('');
  }
}

async function handleStats(args: CliArgs): Promise<void> {
  if (!args.index) {
    console.error('Error: stats command requires --index flag.');
    console.error('Usage: argus stats --index ./indices/docs.argus');
    process.exitCode = 1;
    return;
  }

  const indexPath = path.resolve(args.index);
  if (!fs.existsSync(indexPath)) {
    console.error(`Error: Index file does not exist: ${indexPath}`);
    process.exitCode = 1;
    return;
  }

  const buffer = await fs.promises.readFile(indexPath);
  const header = readIndexHeader(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  const fileSizeKb = (header.totalFileSize / 1024).toFixed(2);

  console.log('\n📊 Argus Index Statistics');
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
  if (!args.index) {
    console.error('Error: serve command requires --index flag.');
    console.error('Usage: argus serve --index ./indices/docs.argus [--port 8080]');
    process.exitCode = 1;
    return;
  }

  const indexPath = path.resolve(args.index);
  if (!fs.existsSync(indexPath)) {
    console.error(`Error: Index file does not exist: ${indexPath}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Loading index from ${indexPath}...`);
  const engine = await ArgusEngine.load(indexPath);
  const server = new ArgusServer(engine);

  const port = args.port ?? 8080;
  const activePort = await server.start({ port });

  console.log(`\n🚀 Argus Search Server running!`);
  console.log(`🌐 Web UI & Playground: http://localhost:${activePort}`);
  console.log(`📡 REST API Endpoint:   http://localhost:${activePort}/api/search?q=your_query`);
  console.log(`📊 Index Stats:         http://localhost:${activePort}/api/stats\n`);
  console.log(`Press Ctrl+C to stop the server.`);
}

async function collectDocuments(targetPath: string): Promise<IndexableDocument[]> {
  const documents: IndexableDocument[] = [];
  let nextDocId = 1;

  async function walk(dirOrFile: string): Promise<void> {
    const stat = await fs.promises.stat(dirOrFile);

    if (stat.isFile()) {
      const ext = path.extname(dirOrFile).toLowerCase();
      const content = await fs.promises.readFile(dirOrFile, 'utf-8');

      if (ext === '.json') {
        try {
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
      } else if (ext === '.md' || ext === '.txt') {
        const basename = path.basename(dirOrFile, ext);
        documents.push({
          id: nextDocId++,
          title: basename,
          body: content,
        });
      }
    } else if (stat.isDirectory()) {
      const entries = await fs.promises.readdir(dirOrFile);
      for (const entry of entries) {
        if (!entry.startsWith('.')) {
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
🚀 Argus — High-Performance Full-Text Search Engine CLI

USAGE:
  argus <command> [options]

COMMANDS:
  index   Index documents into an .argus binary file
          --source <dir|file>   Directory or file of documents (.json, .md, .txt)
          --output <file.argus> Target binary index path

  search  Search an index using BM25 relevance and boolean query syntax
          --index <file.argus>  Path to binary .argus index
          "<query>"             Search query (e.g. 'consensus AND "fault tolerance"')
          --limit <number>      Maximum number of results to display (default: 10)

  stats   Inspect index statistics and metadata
          --index <file.argus>  Path to binary .argus index

  serve   Start local HTTP search server with REST API and Web UI
          --index <file.argus>  Path to binary .argus index
          --port <number>       Port number (default: 8080)

EXAMPLES:
  argus index --source ./docs --output ./indices/docs.argus
  argus search --index ./indices/docs.argus "distributed consensus"
  argus stats --index ./indices/docs.argus
  argus serve --index ./indices/docs.argus --port 8080
`);
}

// Auto-run if executed directly as entrypoint
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  runCli();
}
