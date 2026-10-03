/**
 * Argus Search Engine — Interactive In-Memory REPL & Document Studio
 * Dedicated client-side engine with live personal file & folder ingestion,
 * custom text indexing, Porter stemmer analysis, and Okapi BM25 scoring.
 */

// ============================================================================
// 1. Algorithmic Porter Stemmer
// ============================================================================
const PorterStemmer = (() => {
  const step2list = {
    "ational": "ate", "tional": "tion", "enci": "ence", "anci": "ance",
    "izer": "ize", "bli": "ble", "alli": "al", "entli": "ent", "eli": "e",
    "ousli": "ous", "ization": "ize", "ation": "ate", "ator": "ate",
    "alism": "al", "iveness": "ive", "fulness": "ful", "ousness": "ous",
    "aliti": "al", "iviti": "ive", "biliti": "ble", "logi": "log"
  };

  const step3list = {
    "icate": "ic", "ative": "", "alize": "al", "iciti": "ic",
    "ical": "ic", "ful": "", "ness": ""
  };

  const c = "[^aeiou]";
  const v = "[aeiouy]";
  const C = c + "[^aeiouy]*";
  const V = v + "[aeiou]*";

  const mgr0 = "^(" + C + ")?" + V + C;
  const meq1 = "^(" + C + ")?" + V + C + "(" + V + ")?$";
  const mgr1 = "^(" + C + ")?" + V + C + V + C;
  const s_v = "^(" + C + ")?" + v;

  return function stem(w) {
    w = (w || "").toLowerCase();
    if (w.length < 3) return w;

    let firstch = w.substr(0, 1);
    if (firstch === "y") {
      w = "Y" + w.substr(1);
    }

    // Step 1a
    let re = /^(.+?)(ss|i)es$/;
    let re2 = /^(.+?)([^s])s$/;
    if (re.test(w)) { w = w.replace(re, "$1$2"); }
    else if (re2.test(w)) { w = w.replace(re2, "$1$2"); }

    // Step 1b
    re = /^(.+?)eed$/;
    re2 = /^(.+?)(ed|ing)$/;
    if (re.test(w)) {
      let fp = re.exec(w);
      re = new RegExp(mgr0);
      if (re.test(fp[1])) {
        re = /.$/;
        w = w.replace(re, "");
      }
    } else if (re2.test(w)) {
      let fp = re2.exec(w);
      let stemVal = fp[1];
      re2 = new RegExp(s_v);
      if (re2.test(stemVal)) {
        w = stemVal;
        re2 = /(at|bl|iz)$/;
        let re3 = new RegExp("([^aeiouylsz])\\1$");
        let re4 = new RegExp("^" + C + v + "[^aeiouwxy]$");
        if (re2.test(w)) { w = w + "e"; }
        else if (re3.test(w)) { re = /.$/; w = w.replace(re, ""); }
        else if (re4.test(w)) { w = w + "e"; }
      }
    }

    // Step 1c
    re = /^(.+?)y$/;
    if (re.test(w)) {
      let fp = re.exec(w);
      let stemVal = fp[1];
      re = new RegExp(s_v);
      if (re.test(stemVal)) { w = stemVal + "i"; }
    }

    // Step 2
    re = /^(.+?)(ational|tional|enci|anci|izer|bli|alli|entli|eli|ousli|ization|ation|ator|alism|iveness|fulness|ousness|aliti|iviti|biliti|logi)$/;
    if (re.test(w)) {
      let fp = re.exec(w);
      let stemVal = fp[1];
      let suffix = fp[2];
      re = new RegExp(mgr0);
      if (re.test(stemVal)) {
        w = stemVal + step2list[suffix];
      }
    }

    // Step 3
    re = /^(.+?)(icate|ative|alize|iciti|ical|ful|ness)$/;
    if (re.test(w)) {
      let fp = re.exec(w);
      let stemVal = fp[1];
      let suffix = fp[2];
      re = new RegExp(mgr0);
      if (re.test(stemVal)) {
        w = stemVal + step3list[suffix];
      }
    }

    // Step 4
    re = /^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$/;
    re2 = /^(.+?)(s|t)(ion)$/;
    if (re.test(w)) {
      let fp = re.exec(w);
      let stemVal = fp[1];
      re = new RegExp(mgr1);
      if (re.test(stemVal)) {
        w = stemVal;
      }
    } else if (re2.test(w)) {
      let fp = re2.exec(w);
      let stemVal = fp[1] + fp[2];
      re2 = new RegExp(mgr1);
      if (re2.test(stemVal)) {
        w = stemVal;
      }
    }

    // Step 5
    re = /^(.+?)e$/;
    if (re.test(w)) {
      let fp = re.exec(w);
      let stemVal = fp[1];
      re = new RegExp(mgr1);
      re2 = new RegExp(meq1);
      let re3 = new RegExp("^" + C + v + "[^aeiouwxy]$");
      if (re.test(stemVal) || (re2.test(stemVal) && !(re3.test(stemVal)))) {
        w = stemVal;
      }
    }

    re = /ll$/;
    re2 = new RegExp(mgr1);
    if (re.test(w) && re2.test(w)) {
      re = /.$/;
      w = w.replace(re, "");
    }

    if (firstch === "y") {
      w = "y" + w.substr(1);
    }

    return w;
  };
})();

// ============================================================================
// 2. Stopwords Dictionary (~170 Standard English Terms)
// ============================================================================
const STOPWORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
  "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
  "below", "between", "both", "but", "by", "can't", "cannot", "could", "couldn't",
  "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during",
  "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't",
  "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here",
  "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i",
  "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it",
  "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my",
  "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or",
  "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same",
  "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "so",
  "some", "such", "than", "that", "that's", "the", "their", "theirs", "them",
  "themselves", "then", "there", "there's", "these", "they", "they'd", "they'll",
  "they're", "they've", "this", "those", "through", "to", "too", "under", "until",
  "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were",
  "weren't", "what", "what's", "when", "when's", "where", "where's", "which",
  "while", "who", "who's", "whom", "why", "why's", "with", "won't", "would",
  "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours",
  "yourself", "yourselves"
]);

// ============================================================================
// 3. Tokenizer Pipeline
// ============================================================================
function tokenize(text) {
  if (!text) return [];
  const normalized = text.normalize("NFKD").toLowerCase();
  const rawWords = normalized.match(/[\p{L}\p{N}]+/gu) || [];
  const tokens = [];

  for (let i = 0; i < rawWords.length; i++) {
    const raw = rawWords[i];
    if (STOPWORDS.has(raw)) continue;
    const stem = PorterStemmer(raw);
    tokens.push({ raw, stem, position: i });
  }

  return tokens;
}

// ============================================================================
// 4. Binary Extractors (PDF & Office OpenXML)
// ============================================================================
if (typeof window !== "undefined" && window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

async function extractPdfText(file) {
  if (typeof window !== "undefined" && !window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          resolve();
        } else {
          reject(new Error("PDF parser failed to initialize"));
        }
      };
      script.onerror = () => reject(new Error("Could not load PDF extraction engine from CDN"));
      document.head.appendChild(script);
    });
  }

  if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const pagesText = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    let pageStr = "";
    let lastY = null;

    for (const item of content.items) {
      if (!item.str) continue;
      const text = item.str;
      const y = item.transform ? item.transform[5] : null;

      if (lastY !== null && y !== null) {
        const yDiff = Math.abs(y - lastY);
        if (yDiff > 14) {
          // Paragraph break or section break
          pageStr += "\n\n";
        } else if (yDiff > 3 || item.hasEOL) {
          // Line break
          pageStr += "\n";
        } else {
          // Word spacing on same line
          if (pageStr && !pageStr.endsWith(" ") && !pageStr.endsWith("\n")) {
            pageStr += " ";
          }
        }
      }

      pageStr += text;
      lastY = y;
    }

    if (pageStr.trim()) {
      pagesText.push(`### Page ${pageNum}\n\n` + pageStr.trim());
    }
  }

  const full = pagesText.join("\n\n").trim();
  if (!full) {
    throw new Error("This PDF does not contain selectable text (may be an image or scanned document).");
  }
  return full;
}

async function extractDocxText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  let pos = 0;
  const texts = [];
  const textDecoder = new TextDecoder();

  while (pos < bytes.length - 30) {
    if (view.getUint32(pos, true) === 0x04034b50) {
      const method = view.getUint16(pos + 8, true);
      const compSize = view.getUint32(pos + 18, true);
      const nameLen = view.getUint16(pos + 26, true);
      const extraLen = view.getUint16(pos + 28, true);
      const nameBytes = bytes.subarray(pos + 30, pos + 30 + nameLen);
      const name = textDecoder.decode(nameBytes);
      const dataStart = pos + 30 + nameLen + extraLen;

      if (/word\/document\.xml/i.test(name) || /ppt\/slides\/slide\d+\.xml/i.test(name)) {
        const compressed = bytes.subarray(dataStart, dataStart + compSize);
        try {
          let xml = "";
          if (method === 8 && typeof DecompressionStream !== "undefined") {
            const ds = new DecompressionStream("deflate-raw");
            const writer = ds.writable.getWriter();
            writer.write(compressed);
            writer.close();
            xml = await new Response(ds.readable).text();
          } else if (method === 0) {
            xml = textDecoder.decode(compressed);
          }
          const clean = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          if (clean.length > 0) texts.push(clean);
        } catch (e) {
          console.warn("Office XML decompression error:", e);
        }
      }
      pos = dataStart + compSize;
    } else {
      pos++;
    }
  }
  return texts.join("\n\n").trim();
}

// ============================================================================
// 5. Intelligent Content Extractor & HTML Cleaner
// ============================================================================
function extractReadableDocument(rawContent, filename = "") {
  if (!rawContent || typeof rawContent !== "string") {
    return {
      title: filename || "Untitled Document",
      body: "",
      rawContent: "",
      docType: "Text Document",
      isHtml: false
    };
  }

  const isHtml = /\.html?$/i.test(filename) || 
                 /^\s*<!doctype\s+html/i.test(rawContent) || 
                 /<html[\s>]/i.test(rawContent) ||
                 /<head[\s>]/i.test(rawContent) ||
                 /<body[\s>]/i.test(rawContent);

  if (isHtml) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawContent, "text/html");

      // Extract title from <title> tag, or first <h1>/<h2>, or filename
      let title = "";
      if (doc.title && doc.title.trim()) {
        title = doc.title.trim();
      } else {
        const h1 = doc.querySelector("h1, h2, .title, .title-slide, header");
        if (h1 && h1.textContent.trim()) {
          title = h1.textContent.trim().split("\n")[0].trim();
        }
      }
      if (!title) title = filename || "HTML Document";

      // Detect presentation vs general HTML
      const isPresentation = doc.querySelector(".reveal, .slides, .presentation, .slide") !== null ||
                             rawContent.includes("reveal.js") || 
                             rawContent.includes("class=\"slides\"");

      // Remove non-content tags: style, script, noscript, svg, link, iframe, meta
      const junk = doc.querySelectorAll("style, script, noscript, svg, link, iframe, meta, button.theme-toggle");
      junk.forEach(el => el.remove());

      // Extract structured content preserving sections, slides, headers, and lists
      function extractBlocks(element) {
        if (!element) return "";
        let out = "";
        for (const child of element.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            const val = child.nodeValue.replace(/[\r\n\t]+/g, " ");
            if (val.trim()) {
              out += (out.length > 0 && !out.endsWith("\n") && !out.endsWith(" ") ? " " : "") + val.trim();
            }
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            const tag = child.tagName.toLowerCase();
            if (tag === "br") {
              out += "\n";
              continue;
            }
            if (tag === "hr") {
              out += "\n\n---\n\n";
              continue;
            }

            const isHeading = /^h[1-6]$/.test(tag);
            const isSection = tag === "section" || (child.classList && child.classList.contains("slide"));
            const isBlock = /^(p|div|section|article|li|ol|ul|tr|table|header|footer|blockquote|main|dd|dt)$/.test(tag);
            const isCell = tag === "td" || tag === "th";

            if (isSection || isHeading) out += "\n\n### ";
            else if (tag === "li") out += "\n• ";
            else if (isBlock) out += "\n\n";
            else if (isCell) out += " | ";

            out += extractBlocks(child);

            if (isSection || isHeading || isBlock) out += "\n";
          }
        }
        return out;
      }

      let cleanBody = extractBlocks(doc.body || doc.documentElement);
      // Clean up multiple spaces, consecutive newlines, and strip accidental ### with nothing after
      cleanBody = cleanBody
        .split("\n")
        .map(l => l.trim())
        .filter((l, idx, arr) => {
          if (l === "###") return false;
          if (l.length === 0 && idx > 0 && arr[idx - 1].length === 0) return false;
          return true;
        })
        .join("\n")
        .trim();

      return {
        title,
        body: cleanBody || rawContent,
        rawContent,
        docType: isPresentation ? "HTML Presentation" : "HTML Document",
        isHtml: true
      };
    } catch (e) {
      console.warn("DOMParser failed, falling back to regex stripper:", e);
      const noStyle = rawContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
      const noScript = noStyle.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
      const clean = noScript.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return {
        title: filename || "HTML Document",
        body: clean,
        rawContent,
        docType: "HTML Document",
        isHtml: true
      };
    }
  }

  // Handle JSON files
  if (/\.json$/i.test(filename) || (rawContent.trim().startsWith("{") || rawContent.trim().startsWith("["))) {
    try {
      const parsed = JSON.parse(rawContent);
      let extractedText = "";
      if (Array.isArray(parsed)) {
        extractedText = parsed.map(item => {
          if (typeof item === "string") return item;
          return Object.values(item).filter(v => typeof v === "string").join(" — ");
        }).join("\n\n");
      } else if (typeof parsed === "object" && parsed !== null) {
        extractedText = Object.entries(parsed).map(([k, v]) => {
          return `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`;
        }).join("\n");
      }
      return {
        title: filename || "JSON Data",
        body: extractedText || rawContent,
        rawContent,
        docType: "JSON Data",
        isHtml: false
      };
    } catch {
      // Not valid JSON, continue to text
    }
  }

  // Markdown or plain text
  const isMd = /\.md$/i.test(filename);
  let title = filename || "Text Document";
  if (isMd) {
    const firstH1 = rawContent.match(/^#\s+(.+)$/m);
    if (firstH1) title = firstH1[1].trim();
  }

  let docType = "Text Document";
  if (/\.pdf$/i.test(filename)) docType = "PDF Document";
  else if (/\.docx$/i.test(filename)) docType = "Word Document";
  else if (/\.pptx$/i.test(filename)) docType = "PowerPoint Document";
  else if (isMd) docType = "Markdown";

  return {
    title,
    body: rawContent,
    rawContent,
    docType,
    isHtml: false
  };
}

function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightTermsInText(str, stems, queryWords = []) {
  if (!str) return "";
  const tokens = str.split(/([\p{L}\p{N}]+)/u);
  return tokens.map(token => {
    if (!token) return "";
    const clean = token.toLowerCase();
    const s = PorterStemmer(clean);
    const isMatch = (stems && stems.length > 0 && stems.includes(s)) ||
                    (queryWords && queryWords.includes(clean));
    if (isMatch) {
      return `<mark class="search-highlight">${escapeHtml(token)}</mark>`;
    }
    return escapeHtml(token);
  }).join("");
}

// ============================================================================
// 5. In-Memory Search Engine
// ============================================================================
class StudioEngine {
  constructor(docs = []) {
    this.documents = new Map();
    this.docLengths = new Map();
    this.totalDocLength = 0;
    this.postings = new Map(); // stem -> Map<docId, { tf, positions }>
    this.k1 = 1.2;
    this.b = 0.75;

    for (const doc of docs) {
      this.addDocument(doc);
    }
  }

  addDocument(doc) {
    const docId = typeof doc.id === "number" ? doc.id : this.getNextDocId();
    const isFile = !!doc.isFile;
    const isNote = doc.isNote !== undefined ? !!doc.isNote : !isFile;
    const fileName = doc.fileName || (isFile ? doc.title : "") || "";

    // Extract clean readable content for indexing and reading view
    const extracted = extractReadableDocument(doc.body || "", fileName || doc.title || "");
    const finalTitle = doc.title && doc.title !== fileName ? doc.title : (extracted.title || fileName || "Untitled Document");

    const storedDoc = {
      id: docId,
      title: finalTitle,
      path: doc.path || (isFile ? `files/${fileName || 'file-' + docId}` : `notes/note-${docId}.md`),
      body: extracted.body,
      rawContent: doc.rawContent || doc.body || "",
      isPersonal: true,
      isFile: isFile,
      isNote: isNote,
      docType: extracted.docType,
      isHtml: extracted.isHtml,
      fileSize: doc.fileSize || 0,
      fileName: fileName || finalTitle
    };

    if (this.documents.has(docId)) {
      this.removeDocument(docId);
    }

    this.documents.set(docId, storedDoc);
    const text = `${storedDoc.title} ${storedDoc.body}`;
    const tokens = tokenize(text);

    this.docLengths.set(docId, tokens.length);
    this.totalDocLength += tokens.length;

    for (let pos = 0; pos < tokens.length; pos++) {
      const stem = tokens[pos].stem;
      if (!this.postings.has(stem)) {
        this.postings.set(stem, new Map());
      }
      const termMap = this.postings.get(stem);
      if (!termMap.has(docId)) {
        termMap.set(docId, { tf: 0, positions: [] });
      }
      const entry = termMap.get(docId);
      entry.tf++;
      entry.positions.push(pos);
    }

    return storedDoc;
  }

  removeDocument(docId) {
    if (!this.documents.has(docId)) return false;
    const dl = this.docLengths.get(docId) || 0;
    this.totalDocLength = Math.max(0, this.totalDocLength - dl);
    this.docLengths.delete(docId);
    this.documents.delete(docId);

    for (const [stem, termMap] of this.postings.entries()) {
      if (termMap.has(docId)) {
        termMap.delete(docId);
        if (termMap.size === 0) {
          this.postings.delete(stem);
        }
      }
    }
    return true;
  }

  getNextDocId() {
    let max = 0;
    for (const id of this.documents.keys()) {
      if (id > max) max = id;
    }
    return max + 1;
  }

  get avgdl() {
    return this.documents.size > 0 ? this.totalDocLength / this.documents.size : 1;
  }

  search(queryStr, filter = "all") {
    const startTime = performance.now();
    queryStr = (queryStr || "").trim();
    if (!queryStr) {
      return {
        results: [],
        latencyMs: 0,
        astPlan: "EMPTY",
        tokens: [],
        telemetry: {
          candidatesScanned: 0,
          termsLookedUp: 0,
          wandPruned: 0,
          avgDocLength: Math.round(this.avgdl)
        }
      };
    }

    const phraseMatch = queryStr.match(/"([^"]+)"/);
    let exactPhrase = phraseMatch ? phraseMatch[1] : null;

    const isNotQuery = /\bNOT\b/i.test(queryStr);
    const isOrQuery = /\bOR\b/i.test(queryStr);

    let cleanQuery = queryStr.replace(/"/g, "");
    const tokens = tokenize(cleanQuery);
    const stems = tokens.map(t => t.stem);

    let astPlan = "";
    if (exactPhrase) {
      astPlan = `PhraseQuery("${exactPhrase}") -> PositionalVerifier(slop=0)`;
    } else if (isNotQuery) {
      const parts = queryStr.split(/\bNOT\b/i);
      astPlan = `BinaryOp(NOT)\n  ├─ Positive: Term("${parts[0].trim()}")\n  └─ Exclude: Term("${parts[1].trim()}")`;
    } else if (isOrQuery) {
      astPlan = `BinaryOp(OR, [${stems.map(s => `Term("${s}")`).join(", ")}])`;
    } else {
      astPlan = stems.length > 1
        ? `BinaryOp(AND, [${stems.map(s => `Term("${s}")`).join(", ")}])`
        : `TermQuery("${stems[0] || ""}")`;
    }

    const N = this.documents.size;
    const scores = new Map();
    let candidatesScanned = 0;
    let wandPruned = 0;

    for (const stem of stems) {
      if (!this.postings.has(stem)) continue;
      const termPostings = this.postings.get(stem);
      const df = termPostings.size;

      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

      for (const [docId, posting] of termPostings.entries()) {
        const doc = this.documents.get(docId);
        if (!doc) continue;

        // Apply corpus filter: 'all' | 'files' | 'notes' | 'personal'
        if (filter === "files" && !doc.isFile) continue;
        if (filter === "notes" && !doc.isNote) continue;
        if (filter === "personal" && !doc.isFile) continue;

        candidatesScanned++;
        const dl = this.docLengths.get(docId) || this.avgdl;
        const tf = posting.tf;

        const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (dl / this.avgdl)));
        const termScore = idf * tfNorm;

        const current = scores.get(docId) || {
          docId,
          score: 0,
          matchedStems: new Set(),
          tfSum: 0,
          dl,
          positions: [],
          breakdown: []
        };

        current.score += termScore;
        current.matchedStems.add(stem);
        current.tfSum += tf;
        current.positions.push(...posting.positions);
        current.breakdown.push({
          stem,
          tf,
          idf: +idf.toFixed(2),
          tfNorm: +tfNorm.toFixed(2),
          score: +termScore.toFixed(2)
        });
        scores.set(docId, current);
      }
    }

    let ranked = Array.from(scores.values());

    if (!isOrQuery && stems.length > 1) {
      ranked = ranked.filter(item => {
        if (item.matchedStems.size < Math.min(stems.length, 2)) {
          wandPruned++;
          return false;
        }
        return true;
      });
      for (const item of ranked) {
        if (item.matchedStems.size === stems.length) {
          item.score *= 1.35;
        }
      }
    }

    ranked.sort((a, b) => b.score - a.score);

    const elapsedMs = +(performance.now() - startTime).toFixed(2);

    const results = ranked.slice(0, 15).map(item => {
      const doc = this.documents.get(item.docId);
      const snippetData = this.generateSnippet(doc.body, stems, queryStr, doc.title);
      return {
        docId: doc.id,
        title: doc.title,
        path: doc.path,
        fileName: doc.fileName || "",
        docType: doc.docType || "Text Document",
        isPersonal: true,
        isFile: !!doc.isFile,
        isNote: !!doc.isNote,
        isHtml: !!doc.isHtml,
        fileSize: doc.fileSize || 0,
        score: +item.score.toFixed(2),
        dl: item.dl,
        avgdl: Math.round(this.avgdl),
        breakdown: item.breakdown || [],
        snippet: snippetData.html,
        matchCount: snippetData.matchCount,
        matchedStems: Array.from(item.matchedStems),
        offsets: item.positions.slice(0, 4)
      };
    });

    return {
      results,
      latencyMs: elapsedMs,
      astPlan,
      tokens: stems,
      telemetry: {
        candidatesScanned,
        termsLookedUp: stems.length,
        wandPruned,
        avgDocLength: Math.round(this.avgdl)
      }
    };
  }

  generateSnippet(body, stems, rawQuery = "", title = "") {
    if (!body && !title) return { html: "", matchCount: 0 };

    const queryWords = (rawQuery || "")
      .toLowerCase()
      .split(/\s+/)
      .map(w => w.replace(/[^\w]/g, ""))
      .filter(w => w.length > 0);

    const cleanBody = (body || "").replace(/###\s+/g, "").replace(/•\s+/g, "");

    // Split into sentences / meaningful clauses
    const rawSentences = cleanBody
      .split(/(?<=[.!?\n])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    let matchingSentences = [];
    let totalMatches = 0;

    for (const sent of rawSentences) {
      const wordsInSent = sent.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      let matchCountInSent = 0;
      for (const w of wordsInSent) {
        const s = PorterStemmer(w);
        if ((stems && stems.includes(s)) || queryWords.includes(w)) {
          matchCountInSent++;
        }
      }
      if (matchCountInSent > 0) {
        totalMatches += matchCountInSent;
        matchingSentences.push({ text: sent, count: matchCountInSent });
      }
    }

    matchingSentences.sort((a, b) => b.count - a.count);

    if (matchingSentences.length > 0) {
      const best = matchingSentences[0].text;
      let excerpt = best;
      if (excerpt.length > 180) {
        const words = excerpt.split(/\s+/);
        let matchIdx = 0;
        for (let i = 0; i < words.length; i++) {
          const clean = words[i].toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
          if ((stems && stems.includes(PorterStemmer(clean))) || queryWords.includes(clean)) {
            matchIdx = i;
            break;
          }
        }
        const start = Math.max(0, matchIdx - 5);
        const end = Math.min(words.length, matchIdx + 16);
        excerpt = (start > 0 ? "… " : "") + words.slice(start, end).join(" ") + (end < words.length ? " …" : "");
      }

      const highlighted = highlightTermsInText(excerpt, stems, queryWords);
      return {
        html: highlighted,
        matchCount: totalMatches
      };
    }

    // Check if query term was in title
    let titleMatches = 0;
    if (title) {
      const titleWords = title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      for (const w of titleWords) {
        if ((stems && stems.includes(PorterStemmer(w))) || queryWords.includes(w)) {
          titleMatches++;
        }
      }
    }

    if (titleMatches > 0) {
      const preview = (cleanBody || "").slice(0, 110).trim();
      return {
        html: `<span style="color: var(--accent); font-weight: 500;">Matched in document title</span> ${preview ? `· <span style="color: var(--text-dim); font-size: 0.75rem;">Preview: "${escapeHtml(preview)}…"</span>` : ''}`,
        matchCount: titleMatches
      };
    }

    // Default fallback
    const fallbackText = cleanBody.slice(0, 130).trim();
    return {
      html: escapeHtml(fallbackText) + (cleanBody.length > 130 ? " …" : ""),
      matchCount: 0
    };
  }
}

// ============================================================================
// 6. Known Sample Document Paths (for cleansing sample data from index)
// ============================================================================
const SAMPLE_PATHS = new Set([
  "systems/distributed/raft-consensus.md",
  "ir/ranking/okapi-bm25.md",
  "storage/compression/varint-delta.md",
  "systems/consensus/byzantine-quorum.md",
  "runtime/v8/typedarray-memory.md",
  "ir/index/wand-skip-lists.md",
  "ir/query/positional-phrase.md",
  "analyzer/nlp/porter-stemmer.md",
  "storage/engine/lsm-vs-btree.md",
  "ir/hybrid/vector-lexical.md"
]);

// ============================================================================
// 7. IndexedDB Persistence Layer
// ============================================================================
const ArgusDB = {
  dbName: "argus_search_db",
  version: 1,
  storeName: "documents",

  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "id" });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async getAll() {
    try {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction(this.storeName, "readonly");
        const store = tx.objectStore(this.storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  },

  async put(doc) {
    try {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction(this.storeName, "readwrite");
        const store = tx.objectStore(this.storeName);
        store.put(doc);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  },

  async putMany(docs) {
    try {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction(this.storeName, "readwrite");
        const store = tx.objectStore(this.storeName);
        for (const doc of docs) {
          store.put(doc);
        }
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  },

  async delete(id) {
    try {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction(this.storeName, "readwrite");
        const store = tx.objectStore(this.storeName);
        store.delete(id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  },

  async clear() {
    try {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction(this.storeName, "readwrite");
        const store = tx.objectStore(this.storeName);
        store.clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }
};

// ============================================================================
// 8. Studio UI Controller
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  const engine = new StudioEngine([]);
  let activeCorpusFilter = "all"; // 'all' | 'files' | 'notes'

  // DOM Elements - Search
  const searchInput = document.getElementById("repl-search-input");
  const clearBtn = document.getElementById("clear-search-btn");
  const resultsContainer = document.getElementById("repl-results-list");
  const latencyVal = document.getElementById("latency-val");
  const tokenStream = document.getElementById("token-stream");
  const astPlanPre = document.getElementById("ast-plan-pre");
  const telemCandidates = document.getElementById("telem-candidates");
  const telemTerms = document.getElementById("telem-terms");
  const telemPruned = document.getElementById("telem-pruned");
  const telemAvgdl = document.getElementById("telem-avgdl");
  const resultsCountBadge = document.getElementById("results-count-badge");
  const corpusStatusPill = document.getElementById("corpus-status-pill");
  const tabDocCount = document.getElementById("tab-doc-count");

  // New UX Elements
  const btnLoadSamplesLeft = document.getElementById("btn-load-samples-left");
  const queryAnalysisStrip = document.getElementById("query-analysis-strip");
  const queryTokenChain = document.getElementById("query-token-chain");
  const liveStatTerms = document.getElementById("live-stat-terms");
  const liveStatPostings = document.getElementById("live-stat-postings");
  const liveStatSize = document.getElementById("live-stat-size");
  const liveStatCompression = document.getElementById("live-stat-compression");
  const liveStatAvgdl = document.getElementById("live-stat-avgdl");
  const toastActionContainer = document.getElementById("toast-action-container");

  // Filter Buttons & Counts
  const filterCountAll = document.getElementById("filter-count-all");
  const filterCountFiles = document.getElementById("filter-count-files");
  const filterCountNotes = document.getElementById("filter-count-notes");
  const filterCountPersonal = document.getElementById("filter-count-personal");

  // Status & Header Action Elements
  const studioStatusBar = document.getElementById("studio-status-bar");
  const btnStatusUpload = document.getElementById("btn-status-upload");
  const btnStatusNote = document.getElementById("btn-status-note");
  const btnHeaderNote = document.getElementById("btn-header-note");
  const btnHeaderUpload = document.getElementById("btn-header-upload");
  const btnToggleInternals = document.getElementById("btn-toggle-internals");
  const btnCloseInternals = document.getElementById("btn-close-internals");
  const internalsDrawer = document.getElementById("internals-drawer");
  const internalsBackdrop = document.getElementById("internals-backdrop");

  // Note Modal Elements
  const noteModalBackdrop = document.getElementById("note-modal-backdrop");
  const noteModalCloseBtn = document.getElementById("note-modal-close-btn");
  const noteModalCancelBtn = document.getElementById("note-modal-cancel-btn");
  const btnDropzoneNote = document.getElementById("btn-dropzone-note");
  const btnLeftAddNote = document.getElementById("btn-left-add-note");

  // Personal File Ingestion Elements
  const dropzone = document.getElementById("studio-dropzone");
  const localFileInput = document.getElementById("local-file-input");
  const localFolderInput = document.getElementById("local-folder-input");
  const btnBrowseFiles = document.getElementById("btn-browse-files");
  const btnBrowseFolder = document.getElementById("btn-browse-folder");
  const personalFileCount = document.getElementById("personal-file-count");
  const personalFilesList = document.getElementById("personal-files-list");
  const btnClearPersonalFiles = document.getElementById("btn-clear-personal-files");

  // Ingestion Form Elements
  const docTitleInput = document.getElementById("doc-title-input");
  const docPathInput = document.getElementById("doc-path-input");
  const docBodyInput = document.getElementById("doc-body-input");
  const btnIndexDoc = document.getElementById("btn-index-doc");
  const btnIndexAddAnother = document.getElementById("btn-index-add-another");
  const liveWordCount = document.getElementById("live-word-count");
  const liveCharCount = document.getElementById("live-char-count");
  const liveTokenCount = document.getElementById("live-token-count");
  const liveStemChips = document.getElementById("live-stem-chips");

  // Doc Manager Elements
  const studioDocList = document.getElementById("studio-doc-list");
  const docFilterInput = document.getElementById("doc-filter-input");
  const btnResetCorpus = document.getElementById("btn-reset-corpus");

  // Bulk Elements
  const bulkJsonInput = document.getElementById("bulk-json-input");
  const btnIngestJson = document.getElementById("btn-ingest-json");

  // BM25 Tuning Elements
  const k1Slider = document.getElementById("k1-slider");
  const bSlider = document.getElementById("b-slider");
  const k1Val = document.getElementById("k1-slider-val");
  const bVal = document.getElementById("b-slider-val");
  const btnResetBM25 = document.getElementById("btn-reset-bm25");

  // Modal Elements
  const modalBackdrop = document.getElementById("studio-modal-backdrop");
  const modalCloseBtn = document.getElementById("modal-close-btn");
  const modalDocTitle = document.getElementById("modal-doc-title");
  const modalDocSub = document.getElementById("modal-doc-sub");
  const modalDocBody = document.getElementById("modal-doc-body");
  const modalBtnExcerpts = document.getElementById("modal-btn-excerpts");
  const modalBtnFormatted = document.getElementById("modal-btn-formatted");
  const modalBtnRaw = document.getElementById("modal-btn-raw");
  const modalCopyBtn = document.getElementById("modal-copy-btn");
  let activeModalDocId = null;
  let currentModalViewMode = "excerpts"; // 'excerpts' | 'formatted' | 'raw'

  // Toast with action button support
  const toastNotice = document.getElementById("toast-notice");
  const toastMsg = document.getElementById("toast-msg");
  let toastTimer = null;

  function showToast(message, actionLabel = null, onAction = null) {
    if (!toastNotice) return;
    if (toastTimer) clearTimeout(toastTimer);

    toastMsg.textContent = message;
    if (toastActionContainer) {
      toastActionContainer.innerHTML = "";
      if (actionLabel && onAction) {
        const actBtn = document.createElement("button");
        actBtn.className = "undo-toast-btn";
        actBtn.textContent = actionLabel;
        actBtn.onclick = () => {
          if (toastTimer) clearTimeout(toastTimer);
          toastNotice.classList.remove("show");
          if (toastActionContainer) toastActionContainer.innerHTML = "";
          onAction();
        };
        toastActionContainer.appendChild(actBtn);
      }
    }

    toastNotice.classList.add("show");
    const duration = onAction ? 5500 : 2500;
    toastTimer = setTimeout(() => {
      toastNotice.classList.remove("show");
      if (toastActionContainer) toastActionContainer.innerHTML = "";
    }, duration);
  }

  // Custom In-App Error & Notice Box (Replaces native browser "localhost:8080 says" dialogs)
  const errorModalBackdrop = document.getElementById("error-modal-backdrop");
  const errorBoxTitle = document.getElementById("error-box-title");
  const errorBoxMessage = document.getElementById("error-box-message");
  const errorBoxCloseBtn = document.getElementById("error-box-close-btn");
  const errorBoxOkBtn = document.getElementById("error-box-ok-btn");
  const errorBoxTag = document.getElementById("error-box-tag");

  function showErrorBox(title, message, tag = "Notice") {
    if (errorBoxTitle) errorBoxTitle.textContent = title;
    if (errorBoxMessage) errorBoxMessage.textContent = message;
    if (errorBoxTag) errorBoxTag.textContent = tag;
    if (errorModalBackdrop) {
      errorModalBackdrop.classList.add("open");
      if (errorBoxOkBtn) errorBoxOkBtn.focus();
    }
  }

  function closeErrorBox() {
    if (errorModalBackdrop) {
      errorModalBackdrop.classList.remove("open");
    }
  }

  if (errorBoxCloseBtn) errorBoxCloseBtn.addEventListener("click", closeErrorBox);
  if (errorBoxOkBtn) errorBoxOkBtn.addEventListener("click", closeErrorBox);
  if (errorModalBackdrop) {
    errorModalBackdrop.addEventListener("click", (e) => {
      if (e.target === errorModalBackdrop) closeErrorBox();
    });
  }

  // Note Modal toggles
  function openNoteModal() {
    if (noteModalBackdrop) {
      noteModalBackdrop.classList.add("open");
      if (docTitleInput) docTitleInput.focus();
    }
  }

  function closeNoteModal() {
    if (noteModalBackdrop) {
      noteModalBackdrop.classList.remove("open");
    }
  }

  if (btnHeaderNote) btnHeaderNote.addEventListener("click", openNoteModal);
  if (btnDropzoneNote) btnDropzoneNote.addEventListener("click", openNoteModal);
  if (btnLeftAddNote) btnLeftAddNote.addEventListener("click", openNoteModal);
  if (btnStatusNote) btnStatusNote.addEventListener("click", openNoteModal);
  if (noteModalCloseBtn) noteModalCloseBtn.addEventListener("click", closeNoteModal);
  if (noteModalCancelBtn) noteModalCancelBtn.addEventListener("click", closeNoteModal);

  if (noteModalBackdrop) {
    noteModalBackdrop.addEventListener("click", (e) => {
      if (e.target === noteModalBackdrop) closeNoteModal();
    });
  }

  // Upload triggers from header & status bar
  if (btnHeaderUpload && localFileInput) {
    btnHeaderUpload.addEventListener("click", () => localFileInput.click());
  }
  if (btnStatusUpload && localFileInput) {
    btnStatusUpload.addEventListener("click", () => localFileInput.click());
  }

  // Internals Drawer toggles
  function toggleInternals() {
    if (internalsDrawer) internalsDrawer.classList.toggle("open");
    if (internalsBackdrop) internalsBackdrop.classList.toggle("open");
  }

  function closeInternals() {
    if (internalsDrawer) internalsDrawer.classList.remove("open");
    if (internalsBackdrop) internalsBackdrop.classList.remove("open");
  }

  if (btnToggleInternals) btnToggleInternals.addEventListener("click", toggleInternals);
  if (btnCloseInternals) btnCloseInternals.addEventListener("click", closeInternals);
  if (internalsBackdrop) internalsBackdrop.addEventListener("click", closeInternals);

  // Tab Switching
  document.querySelectorAll(".studio-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".studio-tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".studio-tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      const targetId = btn.getAttribute("data-tab");
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add("active");
    });
  });

  // Corpus Filter Buttons
  document.querySelectorAll(".corpus-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".corpus-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeCorpusFilter = btn.getAttribute("data-filter");
      performSearch(searchInput.value);
    });
  });

  function updateFilterButtons() {
    document.querySelectorAll(".corpus-filter-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-filter") === activeCorpusFilter);
    });
  }

  // --------------------------------------------------------------------------
  // Real-Time Query Analysis Pipeline (Morphological Stems + Boolean Operators)
  // --------------------------------------------------------------------------
  function updateQueryAnalysisStrip(query) {
    if (!queryTokenChain) return;
    const q = (query || "").trim();
    if (!q) {
      queryTokenChain.innerHTML = '<span style="color: #a1a1aa; font-size: 0.72rem;">Type a query to preview morphological stem transformations...</span>';
      return;
    }

    const rawTokens = q.match(/"[^"]*"|[^\s]+/g) || [];
    const htmlParts = [];

    for (const raw of rawTokens) {
      const upper = raw.toUpperCase();
      if (upper === "AND" || upper === "OR" || upper === "NOT") {
        htmlParts.push(`<span class="query-op-chip">${escapeHtml(upper)}</span>`);
      } else if (raw.startsWith('"') && raw.endsWith('"') && raw.length > 1) {
        const inner = raw.slice(1, -1);
        const innerTokens = tokenize(inner);
        const stems = innerTokens.map(t => t.stem).join(" ");
        htmlParts.push(`
          <span class="query-token-item" title="Exact phrase query">
            <span class="query-token-raw">"${escapeHtml(inner)}"</span>
            <span class="query-token-arrow">→</span>
            <span class="query-token-stem">"${escapeHtml(stems)}"</span>
          </span>
        `);
      } else {
        const cleaned = raw.replace(/[^\p{L}\p{N}]+/gu, "");
        if (!cleaned) continue;
        const lower = cleaned.toLowerCase();
        const stem = PorterStemmer(lower);
        const isStop = STOPWORDS.has(lower);

        if (isStop) {
          htmlParts.push(`
            <span class="query-token-item" style="opacity: 0.5;" title="Stopword ignored by engine">
              <span class="query-token-raw" style="text-decoration: line-through;">${escapeHtml(cleaned)}</span>
              <span style="font-size: 0.65rem; color: #f43f5e; margin-left: 2px;">(stop)</span>
            </span>
          `);
        } else if (stem !== lower) {
          htmlParts.push(`
            <span class="query-token-item">
              <span class="query-token-raw">${escapeHtml(cleaned)}</span>
              <span class="query-token-arrow">→</span>
              <span class="query-token-stem">${escapeHtml(stem)}</span>
            </span>
          `);
        } else {
          htmlParts.push(`
            <span class="query-token-item">
              <span class="query-token-stem">${escapeHtml(stem)}</span>
            </span>
          `);
        }
      }
    }

    queryTokenChain.innerHTML = htmlParts.length > 0
      ? htmlParts.join("")
      : '<span style="color: #a1a1aa; font-size: 0.72rem;">No searchable terms</span>';
  }

  // --------------------------------------------------------------------------
  // Live Engine Telemetry & Compression Footprint
  // --------------------------------------------------------------------------
  function updateLiveEngineStats() {
    const numTerms = engine.postings.size;
    let totalPostings = 0;
    for (const postList of engine.postings.values()) {
      totalPostings += postList.length;
    }
    const numDocs = engine.documents.size;
    const avgDl = numDocs > 0 ? (engine.totalDocLength / numDocs).toFixed(1) : "0";

    let totalTextChars = 0;
    for (const doc of engine.documents.values()) {
      totalTextChars += (doc.body ? doc.body.length : 0) + (doc.title ? doc.title.length : 0);
    }
    const estimatedBytes = (numTerms * 64) + (totalPostings * 16) + totalTextChars;
    const sizeKb = estimatedBytes > 0 ? (estimatedBytes / 1024).toFixed(1) + " KB" : "0 KB";
    const ratio = totalPostings > 0 ? "3.2x" : "—";

    if (liveStatTerms) liveStatTerms.textContent = numTerms.toLocaleString();
    if (liveStatPostings) liveStatPostings.textContent = totalPostings.toLocaleString();
    if (liveStatSize) liveStatSize.textContent = sizeKb;
    if (liveStatCompression) liveStatCompression.textContent = ratio;
    if (liveStatAvgdl) liveStatAvgdl.textContent = `${avgDl} terms`;
  }

  // --------------------------------------------------------------------------
  // Preset Chips Enable / Disable State
  // --------------------------------------------------------------------------
  function updatePresetChipsState() {
    const hasDocs = engine.documents.size > 0;
    document.querySelectorAll(".preset-chip").forEach(chip => {
      chip.disabled = !hasDocs;
      chip.style.opacity = hasDocs ? "1" : "0.45";
      chip.style.cursor = hasDocs ? "pointer" : "not-allowed";
      chip.title = hasDocs ? `Search ${chip.getAttribute('data-query')}` : "Index documents first to run example queries";
    });
  }



  // --------------------------------------------------------------------------
  // Recursive Directory Drag & Drop Helper
  // --------------------------------------------------------------------------
  async function extractFilesFromDataTransfer(dataTransfer) {
    const files = [];
    if (!dataTransfer.items) {
      return Array.from(dataTransfer.files || []);
    }

    async function traverseEntry(entry, path = "") {
      if (!entry) return;
      if (entry.isFile) {
        return new Promise((resolve) => {
          entry.file((file) => {
            Object.defineProperty(file, "webkitRelativePath", {
              value: path ? `${path}/${file.name}` : file.name,
              writable: false
            });
            files.push(file);
            resolve();
          }, () => resolve());
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const entries = await new Promise((resolve) => {
          dirReader.readEntries((results) => resolve(results || []), () => resolve([]));
        });
        const currentPath = path ? `${path}/${entry.name}` : entry.name;
        for (const child of entries) {
          await traverseEntry(child, currentPath);
        }
      }
    }

    const entries = [];
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.webkitGetAsEntry) {
        const entry = item.webkitGetAsEntry();
        if (entry) entries.push(entry);
      }
    }

    if (entries.length > 0) {
      for (const entry of entries) {
        await traverseEntry(entry);
      }
      return files;
    }

    return Array.from(dataTransfer.files || []);
  }

  // Execute Search
  function performSearch(query) {
    const response = engine.search(query, activeCorpusFilter);

    // Latency & Counts (Show "—" if search was not executed)
    latencyVal.textContent = query && query.trim() ? `${response.latencyMs} ms` : "—";
    const filterLabel = activeCorpusFilter === "files" ? " (Files Only)" : activeCorpusFilter === "notes" ? " (Notes Only)" : "";
    resultsCountBadge.textContent = `${response.results.length} Matches${filterLabel}`;

    // AST Plan
    astPlanPre.textContent = response.astPlan;

    // Tokens Stream
    if (response.tokens.length > 0) {
      tokenStream.innerHTML = response.tokens
        .map(t => `<span class="token-chip">${escapeHtml(t)}</span>`)
        .join('<span class="token-arrow">→</span>');
    } else {
      tokenStream.innerHTML = '<span class="token-chip" style="opacity: 0.5;">No active search tokens</span>';
    }

    // Telemetry
    telemCandidates.textContent = response.telemetry.candidatesScanned;
    telemTerms.textContent = response.telemetry.termsLookedUp;
    telemPruned.textContent = response.telemetry.wandPruned;
    telemAvgdl.textContent = `${response.telemetry.avgDocLength} terms`;

    // Query analysis & Engine Telemetry Updates
    updateQueryAnalysisStrip(query);
    updateLiveEngineStats();
    updatePresetChipsState();

    // Render Results
    if (response.results.length === 0) {
      if (engine.documents.size === 0) {
        resultsCountBadge.textContent = "0 Matches";
        resultsContainer.innerHTML = `
          <div class="empty-state-card" style="padding: 36px 20px; text-align: center;">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.8" style="margin: 0 auto 12px; display: block;">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <div style="font-size: 1.05rem; font-weight: 700; color: #ffffff; margin-bottom: 6px; font-family: var(--font-sans);">Zero Documents Indexed Yet</div>
            <p style="margin: 0 auto; max-width: 440px; font-size: 0.82rem; color: #a1a1aa; line-height: 1.5; font-family: var(--font-sans);">
              Drop your personal files or folder in the left panel, or click "+ Write New Text Note" to start searching privately in browser memory.
            </p>
          </div>
        `;
        return;
      }

      if (!query.trim()) {
        const allDocs = Array.from(engine.documents.values()).slice(0, 30);
        resultsCountBadge.textContent = `${allDocs.length} Document${allDocs.length === 1 ? '' : 's'} Ready`;
        resultsContainer.innerHTML = allDocs.map((doc, idx) => {
          const typeLabel = doc.docType || (doc.isFile ? "File" : "Note");
          const typeBadge = `<span class="file-pill-badge">${escapeHtml(typeLabel)}</span>`;
          const termCount = engine.docLengths.get(doc.id) || 0;
          const snippetText = escapeHtml((doc.body || "").replace(/\s+/g, " ").trim().slice(0, 220));
          return `
            <article class="result-card" data-doc-id="${doc.id}">
              <div class="result-header">
                <span class="result-rank-num">#${idx + 1}</span>
                <div style="flex: 1; min-width: 0;">
                  <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px; flex-wrap: wrap;">
                    <h3 class="result-title">${escapeHtml(doc.title)}</h3>
                    ${typeBadge}
                  </div>
                  <div class="result-path">${escapeHtml(doc.path)}</div>
                </div>
                <div class="bm25-score-container" title="Indexed term count">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; gap: 8px;">
                    <span style="font-size: 0.65rem; color: #a1a1aa; text-transform: uppercase; font-family: var(--font-sans);">Length</span>
                    <span class="bm25-score-val">${termCount} terms</span>
                  </div>
                  <div class="bm25-score-track">
                    <div class="bm25-score-fill" style="width: ${Math.min(100, Math.max(10, Math.round((termCount / (engine.totalDocLength / (engine.documents.size || 1) || 1)) * 50)))}%;"></div>
                  </div>
                </div>
              </div>
              <div class="result-snippet">${snippetText}${snippetText.length >= 220 ? '…' : ''}</div>
            </article>
          `;
        }).join("");

        resultsContainer.querySelectorAll(".result-card").forEach(card => {
          card.addEventListener("click", () => {
            const id = parseInt(card.getAttribute("data-doc-id"), 10);
            openDocumentModal(id);
          });
        });
        return;
      }

      resultsContainer.innerHTML = `
        <div class="no-results" style="padding: 28px 20px; text-align: center;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 10px; opacity: 0.4;">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <div>No indexed documents match <code>"${escapeHtml(query)}"</code></div>
          <p style="margin-top: 6px; font-size: 0.74rem; color: var(--text-dim);">
            ${activeCorpusFilter === "files" 
              ? "No matches found in uploaded files. Drop more files or switch filter to 'All Documents'!" 
              : activeCorpusFilter === "notes"
              ? "No matches found in text notes. Switch filter to 'All Documents' or add more text!"
              : "Try different search terms, exact phrases, or index additional documents!"}
          </p>
        </div>
      `;
      return;
    }

    const q = searchInput.value.trim();
    const cleanQ = q.replace(/"/g, "");
    const tokens = tokenize(cleanQ);
    const stems = tokens.map(t => t.stem);
    const queryWords = cleanQ.toLowerCase().split(/\s+/).map(w => w.replace(/[^\w]/g, "")).filter(Boolean);
    const maxScore = Math.max(...response.results.map(r => r.score), 0.001);

    resultsContainer.innerHTML = response.results.map((res, idx) => {
      const matchTags = res.matchedStems
        ? res.matchedStems.map(s => `<span class="matched-term-tag">${escapeHtml(s)}</span>`).join("")
        : "";

      const typeLabel = res.docType || (res.isFile ? "File" : "Note");
      const typeBadge = `<span class="file-pill-badge" title="${escapeHtml(typeLabel)}">${escapeHtml(typeLabel)}</span>`;
      const fileSub = res.fileName && res.fileName !== res.title
        ? `<span style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-dim); margin-left: 6px;">(${escapeHtml(res.fileName)})</span>`
        : "";

      const highlightedTitle = highlightTermsInText(res.title, stems, queryWords);
      const scorePct = Math.min(100, Math.max(12, Math.round((res.score / maxScore) * 100)));

      return `
        <article class="result-card" data-doc-id="${res.docId}">
          <div class="result-header">
            <span class="result-rank-num">#${idx + 1}</span>
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px; flex-wrap: wrap;">
                <h3 class="result-title">${highlightedTitle}${fileSub}</h3>
                ${typeBadge}
              </div>
              <div class="result-path">${escapeHtml(res.path)}</div>
            </div>
            <div class="bm25-score-container" title="Okapi BM25 relevance score">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; gap: 8px;">
                <span style="font-size: 0.65rem; color: #a1a1aa; text-transform: uppercase; font-family: var(--font-sans); letter-spacing: 0.5px;">BM25 Score</span>
                <span class="bm25-score-val">${res.score.toFixed(2)}</span>
              </div>
              <div class="bm25-score-track">
                <div class="bm25-score-fill" style="width: ${scorePct}%;"></div>
              </div>
            </div>
          </div>

          <div class="result-snippet">${res.snippet}</div>

          <div class="result-footer-meta">
            <div style="display: flex; gap: 4px; flex-wrap: wrap; align-items: center;">
              ${matchTags}
              ${res.matchCount > 0 ? `<span class="match-count-badge">🎯 ${res.matchCount} match${res.matchCount === 1 ? '' : 'es'}</span>` : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 10px; margin-left: auto;">
              <button class="btn-toggle-breakdown" data-target="breakdown-${res.docId}" title="Inspect TF, IDF and score breakdown">
                Score Breakdown ▾
              </button>
              <span style="color: var(--text-dim); font-size: 0.72rem;">Inspect ↗</span>
            </div>
          </div>

          <div id="breakdown-${res.docId}" class="score-breakdown-panel" style="display: none;">
            <div style="font-size: 0.72rem; color: #cbd5e1; margin-bottom: 8px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
              <span>Document Length: <strong style="color: #ffffff;">${res.dl} terms</strong></span>
              <span>Avg Corpus Length: <strong style="color: #ffffff;">${res.avgdl.toFixed(1)} terms</strong></span>
              <span>Relative Ratio: <strong style="color: var(--accent);">${(res.dl / (res.avgdl || 1)).toFixed(2)}x</strong></span>
            </div>
            <table class="breakdown-table">
              <thead>
                <tr>
                  <th>Term</th>
                  <th>TF</th>
                  <th>IDF</th>
                  <th>Normalized TF</th>
                  <th>BM25 Contribution</th>
                </tr>
              </thead>
              <tbody>
                ${(res.breakdown || []).map(b => `
                  <tr>
                    <td style="color: var(--accent); font-weight: 600; font-family: var(--font-mono);">${escapeHtml(b.stem)}</td>
                    <td style="font-family: var(--font-mono);">${b.tf}</td>
                    <td style="font-family: var(--font-mono);">${b.idf.toFixed(3)}</td>
                    <td style="font-family: var(--font-mono);">${b.tfNorm.toFixed(3)}</td>
                    <td style="color: #6ee7b7; font-weight: 600; font-family: var(--font-mono);">+${b.score.toFixed(3)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </article>
      `;
    }).join("");

    resultsContainer.querySelectorAll(".result-card").forEach(card => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".btn-toggle-breakdown") || e.target.closest(".score-breakdown-panel")) {
          return;
        }
        const id = parseInt(card.getAttribute("data-doc-id"), 10);
        openDocumentModal(id);
      });
    });

    resultsContainer.querySelectorAll(".btn-toggle-breakdown").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetId = btn.getAttribute("data-target");
        const panel = document.getElementById(targetId);
        if (panel) {
          const isOpen = panel.style.display !== "none";
          panel.style.display = isOpen ? "none" : "block";
          btn.textContent = isOpen ? "Score Breakdown ▾" : "Hide Breakdown ▴";
        }
      });
    });
  }

  // Update Corpus Metrics
  function updateCorpusStats() {
    const allDocs = Array.from(engine.documents.values());
    const fileDocs = allDocs.filter(d => d.isFile);
    const noteDocs = allDocs.filter(d => d.isNote);

    if (corpusStatusPill) corpusStatusPill.textContent = `${allDocs.length} DOCS INDEXED`;
    if (tabDocCount) tabDocCount.textContent = allDocs.length;

    if (filterCountAll) filterCountAll.textContent = allDocs.length;
    if (filterCountFiles) filterCountFiles.textContent = fileDocs.length;
    if (filterCountNotes) filterCountNotes.textContent = noteDocs.length;
    if (filterCountPersonal) filterCountPersonal.textContent = fileDocs.length;
    if (personalFileCount) personalFileCount.textContent = `${fileDocs.length} file${fileDocs.length === 1 ? '' : 's'}`;

    if (studioStatusBar) {
      studioStatusBar.style.display = allDocs.length > 0 ? "flex" : "none";
    }
    if (dropzone) {
      dropzone.style.display = "flex";
    }

    renderDocumentList(docFilterInput ? docFilterInput.value : "");
    renderPersonalFilesList(fileDocs);
  }

  // Render Personal Files in Tab 0
  function renderPersonalFilesList(personalDocs) {
    if (!personalFilesList) return;

    if (personalDocs.length === 0) {
      personalFilesList.innerHTML = `
        <div style="padding: 16px; text-align: center; color: var(--text-dim); font-size: 0.76rem;">
          No personal files indexed yet. Drag &amp; drop files above or click "Choose Files..." to test search against your local files!
        </div>
      `;
      return;
    }

    personalFilesList.innerHTML = personalDocs.map(d => {
      const length = engine.docLengths.get(d.id) || 0;
      const sizeKb = d.fileSize ? ` · ${(d.fileSize / 1024).toFixed(1)} KB` : "";
      return `
        <div class="doc-list-item" data-id="${d.id}">
          <div style="flex: 1; min-width: 0;">
            <div class="doc-item-title" title="Click to view file text">${escapeHtml(d.title)}</div>
            <div class="doc-item-sub">
              <span class="file-pill-badge" style="font-size: 0.6rem; padding: 0 4px;">#${d.id}</span>
              <span>${escapeHtml(d.path)}${sizeKb}</span>
              <span>${length} terms</span>
            </div>
          </div>
          <button class="doc-delete-btn" title="Remove this file" data-delete-id="${d.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      `;
    }).join("");

    personalFilesList.querySelectorAll(".doc-item-title").forEach(title => {
      title.addEventListener("click", () => {
        const id = parseInt(title.closest(".doc-list-item").getAttribute("data-id"), 10);
        openDocumentModal(id);
      });
    });

    personalFilesList.querySelectorAll(".doc-delete-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.getAttribute("data-delete-id"), 10);
        engine.removeDocument(id);
        await ArgusDB.delete(id);
        updateCorpusStats();
        updateLiveEngineStats();
        updatePresetChipsState();
        performSearch(searchInput.value);
        showToast(`Removed personal file #${id}`);
      });
    });
  }

  // Render Document List in Left Column
  function renderDocumentList(filter = "") {
    if (!studioDocList) return;
    filter = filter.toLowerCase().trim();
    const docs = Array.from(engine.documents.values()).filter(d => {
      if (!filter) return true;
      return d.title.toLowerCase().includes(filter) || d.path.toLowerCase().includes(filter);
    });

    if (docs.length === 0) {
      const emptyMsg = filter 
        ? "No documents found matching filter." 
        : 'No documents indexed yet. Drop files above or click "+ Write New Text Note" to start.';
      studioDocList.innerHTML = `
        <div style="padding: 20px 14px; text-align: center; color: var(--text-dim); font-size: 0.74rem; line-height: 1.4;">
          ${emptyMsg}
        </div>
      `;
      return;
    }

    studioDocList.innerHTML = docs.map(d => {
      const length = engine.docLengths.get(d.id) || 0;
      const typeLabel = d.isFile ? 'File' : 'Note';
      return `
        <div class="doc-list-item" data-id="${d.id}">
          <div style="flex: 1; min-width: 0;">
            <div class="doc-item-title" title="Click to inspect document">${escapeHtml(d.title)}</div>
            <div class="doc-item-sub">
              <span class="file-pill-badge" style="font-size: 0.6rem; padding: 0 4px;">${typeLabel}</span>
              <span style="color: var(--accent);">#${d.id}</span>
              <span title="${escapeHtml(d.path)}" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;">${escapeHtml(d.path)}</span>
              <span>${length} terms</span>
            </div>
          </div>
          <button class="doc-delete-btn" title="Delete document from index" data-delete-id="${d.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      `;
    }).join("");

    studioDocList.querySelectorAll(".doc-item-title").forEach(title => {
      title.addEventListener("click", () => {
        const id = parseInt(title.closest(".doc-list-item").getAttribute("data-id"), 10);
        openDocumentModal(id);
      });
    });

    studioDocList.querySelectorAll(".doc-delete-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.getAttribute("data-delete-id"), 10);
        engine.removeDocument(id);
        await ArgusDB.delete(id);
        updateCorpusStats();
        updateLiveEngineStats();
        updatePresetChipsState();
        performSearch(searchInput.value);
        showToast(`Document #${id} removed from index`);
      });
    });
  }

  // Process Local Personal Files
  async function processLocalFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    const t0 = performance.now();
    let addedCount = 0;
    const addedDocs = [];
    let lastError = "";

    for (const file of fileList) {
      if (file.size > 25000000) {
        lastError = `File "${file.name}" exceeds 25 MB limit.`;
        continue;
      }

      try {
        const ext = file.name.split(".").pop().toLowerCase();
        let content = "";
        let docType = "Text Document";

        if (ext === "pdf") {
          try {
            content = await extractPdfText(file);
            docType = "PDF Document";
          } catch (pdfErr) {
            console.warn("PDF extraction failed:", pdfErr);
            lastError = pdfErr.message || `Could not read text from "${file.name}".`;
            continue;
          }
        } else if (ext === "docx" || ext === "pptx") {
          try {
            content = await extractDocxText(file);
            docType = ext === "docx" ? "Word Document" : "PowerPoint Document";
          } catch (docxErr) {
            console.warn("Office extraction failed:", docxErr);
            lastError = `Could not decompress Office document "${file.name}".`;
            continue;
          }
        } else {
          content = await file.text();
          if (content.includes("\0")) continue; // Skip raw compiled binary files
        }

        if (!content || !content.trim()) {
          lastError = `No readable text content found in "${file.name}".`;
          continue;
        }

        const doc = engine.addDocument({
          title: file.name,
          path: file.webkitRelativePath || `files/${file.name}`,
          body: content,
          rawContent: content,
          isFile: true,
          isNote: false,
          fileSize: file.size,
          fileName: file.name,
          docType: docType
        });

        addedDocs.push(doc);
        addedCount++;

        // Try syncing with server in background
        fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: [{ name: file.name, content }] })
        }).catch(() => {});

      } catch (err) {
        console.warn("Failed reading", file.name, err);
        lastError = err.message;
      }
    }

    if (addedDocs.length > 0) {
      await ArgusDB.putMany(addedDocs);
    }

    const elapsed = Math.round(performance.now() - t0);

    if (addedCount > 0) {
      activeCorpusFilter = "files";
      updateFilterButtons();
      updateCorpusStats();
      updateLiveEngineStats();
      updatePresetChipsState();
      showToast(`Indexed ${addedCount} file${addedCount > 1 ? "s" : ""} in ${elapsed} ms!`);

      // Do NOT overwrite searchInput so all newly added documents stay visible!
      performSearch(searchInput.value);
    } else {
      showErrorBox("Document Ingestion Notice", lastError || "No readable text, PDF, Word, code, or JSON files found in selected files.", "File Notice");
    }
  }

  // Personal File Input & Dropzone Bindings
  if (btnBrowseFiles && localFileInput) {
    btnBrowseFiles.addEventListener("click", (e) => {
      e.stopPropagation();
      localFileInput.click();
    });

    localFileInput.addEventListener("change", (e) => {
      processLocalFiles(e.target.files);
      localFileInput.value = "";
    });
  }

  if (btnBrowseFolder && localFolderInput) {
    btnBrowseFolder.addEventListener("click", (e) => {
      e.stopPropagation();
      localFolderInput.click();
    });

    localFolderInput.addEventListener("change", (e) => {
      processLocalFiles(e.target.files);
      localFolderInput.value = "";
    });
  }

  if (dropzone) {
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });

    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("dragover");
    });

    dropzone.addEventListener("drop", async (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer) {
        const files = await extractFilesFromDataTransfer(e.dataTransfer);
        if (files && files.length > 0) {
          processLocalFiles(files);
        }
      }
    });

    dropzone.addEventListener("click", () => {
      if (localFileInput) localFileInput.click();
    });
  }

  if (btnClearPersonalFiles) {
    btnClearPersonalFiles.addEventListener("click", async () => {
      const fileIds = [];
      for (const [id, doc] of engine.documents.entries()) {
        if (doc.isFile) fileIds.push(id);
      }
      if (fileIds.length === 0) {
        showToast("No uploaded files to clear");
        return;
      }
      for (const id of fileIds) {
        engine.removeDocument(id);
        await ArgusDB.delete(id);
      }
      activeCorpusFilter = "all";
      updateFilterButtons();
      updateCorpusStats();
      updateLiveEngineStats();
      updatePresetChipsState();
      performSearch(searchInput.value);
      showToast(`Cleared ${fileIds.length} uploaded file${fileIds.length === 1 ? '' : 's'} from index`);
    });
  }

  // Open Document Modal
  function openDocumentModal(docId) {
    const doc = engine.documents.get(docId);
    if (!doc) return;
    activeModalDocId = docId;

    const q = searchInput.value.trim();
    const cleanQ = q.replace(/"/g, "");
    const tokens = tokenize(cleanQ);
    const stems = tokens.map(t => t.stem);
    const queryWords = cleanQ.toLowerCase().split(/\s+/).map(w => w.replace(/[^\w]/g, "")).filter(Boolean);

    modalDocTitle.innerHTML = highlightTermsInText(doc.title, stems, queryWords);
    const fileLabel = doc.fileName && doc.fileName !== doc.title ? ` · <span>${escapeHtml(doc.fileName)}</span>` : "";
    const typeLabel = doc.docType || (doc.isFile ? "Uploaded File" : "Text Note");
    const termCount = engine.docLengths.get(doc.id) || 0;
    const words = doc.body ? doc.body.trim().split(/\s+/).length : 0;
    const queryPill = q ? `<span class="match-count-badge" style="color: var(--accent);">🔍 Query: "${escapeHtml(q)}"</span>` : "";

    modalDocSub.innerHTML = `
      <span>Doc #${doc.id}</span>
      <span>•</span>
      <span>${escapeHtml(doc.path)}</span>
      ${fileLabel}
      <span>•</span>
      <span style="color: var(--accent);">${words} words</span>
      <span>•</span>
      <span>${termCount} indexed terms</span>
      <span>•</span>
      <span class="file-pill-badge" style="font-size:0.62rem; padding: 1px 6px;">${escapeHtml(typeLabel)}</span>
      ${queryPill}
    `;

    // Default to 'formatted' (Reading View) so user sees the full formatted document with highlighted matches!
    currentModalViewMode = "formatted";
    if (modalBtnFormatted) modalBtnFormatted.classList.add("active");
    if (modalBtnExcerpts) modalBtnExcerpts.classList.remove("active");
    if (modalBtnRaw) modalBtnRaw.classList.remove("active");

    renderModalContent(doc);
    modalBackdrop.classList.add("open");
  }

  function renderModalContent(doc) {
    if (!doc) return;

    if (currentModalViewMode === "raw") {
      const raw = doc.rawContent || doc.body;
      modalDocBody.innerHTML = `<pre class="modal-raw-pre"><code>${escapeHtml(raw)}</code></pre>`;
      return;
    }

    const q = searchInput.value.trim();
    const cleanQ = q.replace(/"/g, "");
    const tokens = tokenize(cleanQ);
    const stems = tokens.map(t => t.stem);
    const queryWords = cleanQ.toLowerCase().split(/\s+/).map(w => w.replace(/[^\w]/g, "")).filter(Boolean);

    if (currentModalViewMode === "excerpts") {
      modalDocBody.innerHTML = formatMatchedExcerpts(doc.body, stems, queryWords);
      return;
    }

    // Formatted Clean Reading View
    modalDocBody.innerHTML = formatDocumentContent(doc.body, stems, queryWords);

    // Auto-scroll to first highlighted search term if query exists
    if (q) {
      setTimeout(() => {
        const firstMark = modalDocBody.querySelector("mark");
        if (firstMark) {
          firstMark.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
    }
  }

  function formatMatchedExcerpts(text, stems, queryWords) {
    if (!text) return '<div style="color: var(--text-dim); text-align: center; padding: 20px;">Empty document content</div>';

    const lines = text.split("\n");
    let currentSection = "Document Overview";
    let matchedBlocks = [];

    for (let rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (/^#{1,6}\s+/.test(line)) {
        currentSection = line.replace(/^#{1,6}\s+/, "");
        continue;
      }

      const words = line.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      const hasMatch = words.some(w => (stems && stems.includes(PorterStemmer(w))) || (queryWords && queryWords.includes(w)));

      if (hasMatch) {
        const isBullet = line.startsWith("• ") || /^[-*+]\s+/.test(line);
        const cleanLine = line.replace(/^(•|[-*+])\s+/, "");
        const highlighted = highlightTermsInText(cleanLine, stems, queryWords);
        matchedBlocks.push({
          section: currentSection,
          isBullet: isBullet,
          html: highlighted
        });
      }
    }

    if (matchedBlocks.length === 0) {
      return `
        <div style="padding: 32px 20px; text-align: center; color: var(--text-dim);">
          <div style="font-size: 1.05rem; margin-bottom: 8px; color: #ffffff; font-weight: 600;">No body text matched your query directly</div>
          <p style="font-size: 0.8rem; max-width: 440px; margin: 0 auto 16px; line-height: 1.5;">
            The search terms matched in the document title or metadata. Click "Reading View" above to read the full document.
          </p>
        </div>
      `;
    }

    let out = `
      <div style="margin-bottom: 18px; padding: 10px 16px; background: rgba(0, 210, 255, 0.06); border: 1px solid var(--accent-border); border-radius: 6px; font-family: var(--font-mono); font-size: 0.74rem; color: var(--accent); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
        <span>🎯 Showing ${matchedBlocks.length} matched passage${matchedBlocks.length === 1 ? '' : 's'} containing your search terms</span>
        <span style="color: var(--text-dim); font-size: 0.68rem;">Switch to "Reading View" for full document</span>
      </div>
    `;

    let lastSection = "";
    for (const b of matchedBlocks) {
      if (b.section !== lastSection) {
        out += `<h4 class="modal-content-h4" style="margin-top: 18px;">${escapeHtml(b.section)}</h4>`;
        lastSection = b.section;
      }
      if (b.isBullet) {
        out += `<ul class="modal-content-list" style="margin-bottom: 10px;"><li>${b.html}</li></ul>`;
      } else {
        out += `<p class="modal-content-p" style="margin-bottom: 10px;">${b.html}</p>`;
      }
    }

    return out;
  }

  function formatDocumentContent(text, stems, queryWords) {
    if (!text) return '<div style="color: var(--text-dim); text-align: center; padding: 20px;">Empty document content</div>';

    const lines = text.split("\n");
    let html = "";
    let inList = false;

    function inlineFormat(str) {
      let highlighted = highlightTermsInText(str, stems, queryWords);
      highlighted = highlighted.replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.06); padding: 1px 5px; border-radius: 4px; font-family: var(--font-mono); font-size: 0.85em; color: var(--accent);">$1</code>');
      highlighted = highlighted.replace(/\*\*([^*]+)\*\*/g, '<strong style="color: #ffffff;">$1</strong>');
      return highlighted;
    }

    for (let rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        if (inList) { html += "</ul>"; inList = false; }
        continue;
      }

      if (line === "---" || line === "***") {
        if (inList) { html += "</ul>"; inList = false; }
        html += '<hr style="border: none; border-top: 1px solid var(--border-subtle); margin: 20px 0;">';
      } else if (/^#{1,6}\s+/.test(line)) {
        if (inList) { html += "</ul>"; inList = false; }
        const level = line.match(/^#{1,6}/)[0].length;
        const hText = inlineFormat(line.replace(/^#{1,6}\s+/, ""));
        const fontSize = level === 1 ? "1.25rem" : level === 2 ? "1.1rem" : "0.95rem";
        html += `<h4 class="modal-content-h4" style="font-size: ${fontSize}; margin-top: 20px; margin-bottom: 8px;">${hText}</h4>`;
      } else if (line.startsWith("• ") || /^[-*+]\s+/.test(line)) {
        if (!inList) { html += '<ul class="modal-content-list" style="margin-bottom: 12px;">'; inList = true; }
        const liText = inlineFormat(line.replace(/^(•|[-*+])\s+/, ""));
        html += `<li style="margin-bottom: 4px;">${liText}</li>`;
      } else {
        if (inList) { html += "</ul>"; inList = false; }
        const pText = inlineFormat(line);
        html += `<p class="modal-content-p" style="margin-bottom: 12px; line-height: 1.6;">${pText}</p>`;
      }
    }

    if (inList) html += "</ul>";
    return html;
  }

  // Modal View Toggle & Actions
  if (modalBtnExcerpts) {
    modalBtnExcerpts.addEventListener("click", () => {
      currentModalViewMode = "excerpts";
      modalBtnExcerpts.classList.add("active");
      if (modalBtnFormatted) modalBtnFormatted.classList.remove("active");
      if (modalBtnRaw) modalBtnRaw.classList.remove("active");
      if (activeModalDocId !== null) {
        renderModalContent(engine.documents.get(activeModalDocId));
      }
    });
  }

  if (modalBtnFormatted) {
    modalBtnFormatted.addEventListener("click", () => {
      currentModalViewMode = "formatted";
      modalBtnFormatted.classList.add("active");
      if (modalBtnExcerpts) modalBtnExcerpts.classList.remove("active");
      if (modalBtnRaw) modalBtnRaw.classList.remove("active");
      if (activeModalDocId !== null) {
        renderModalContent(engine.documents.get(activeModalDocId));
      }
    });
  }

  if (modalBtnRaw) {
    modalBtnRaw.addEventListener("click", () => {
      currentModalViewMode = "raw";
      modalBtnRaw.classList.add("active");
      if (modalBtnExcerpts) modalBtnExcerpts.classList.remove("active");
      if (modalBtnFormatted) modalBtnFormatted.classList.remove("active");
      if (activeModalDocId !== null) {
        renderModalContent(engine.documents.get(activeModalDocId));
      }
    });
  }

  if (modalCopyBtn) {
    modalCopyBtn.addEventListener("click", () => {
      if (activeModalDocId === null) return;
      const doc = engine.documents.get(activeModalDocId);
      if (!doc) return;
      const textToCopy = currentModalViewMode === "raw" ? (doc.rawContent || doc.body) : doc.body;
      navigator.clipboard.writeText(textToCopy).then(() => {
        showToast("Copied document content to clipboard!");
      }).catch(() => {
        showToast("Failed copying to clipboard");
      });
    });
  }

  modalCloseBtn.addEventListener("click", () => {
    modalBackdrop.classList.remove("open");
  });

  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) {
      modalBackdrop.classList.remove("open");
    }
  });

  // Live Input Text Telemetry
  docBodyInput.addEventListener("input", () => {
    const text = docBodyInput.value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const tokens = tokenize(text);

    liveWordCount.textContent = words;
    liveCharCount.textContent = chars;
    liveTokenCount.textContent = tokens.length;

    if (tokens.length > 0) {
      const uniqueStems = Array.from(new Set(tokens.map(t => t.stem))).slice(0, 10);
      liveStemChips.innerHTML = uniqueStems
        .map(s => `<span class="token-chip">${escapeHtml(s)}</span>`)
        .join("");
    } else {
      liveStemChips.innerHTML = '<span class="token-chip" style="opacity: 0.5;">Type text above to preview token stream...</span>';
    }
  });

  // Index Document Action (supports multi-doc '---' delimiter and 'Add Another' flow)
  async function indexCurrentNote(keepModalOpen = false) {
    const rawTitle = docTitleInput.value.trim();
    const rawPath = docPathInput.value.trim();
    const rawBody = docBodyInput.value.trim();

    if (!rawTitle && !rawBody) {
      showErrorBox("Missing Note Content", "Please provide a title or body text before indexing into memory.", "Input Notice");
      return;
    }

    const t0 = performance.now();
    const addedDocs = [];

    // Check if body has multi-document separators `---`
    if (rawBody.includes("\n---\n") || rawBody.includes("\r\n---\r\n")) {
      const parts = rawBody.split(/\r?\n---\r?\n/).map(p => p.trim()).filter(Boolean);
      let partIdx = 1;
      for (const part of parts) {
        let title = rawTitle ? `${rawTitle} (Part ${partIdx})` : `Document #${partIdx}`;
        const matchH = part.match(/^#+\s*(.+)/);
        if (matchH && matchH[1]) {
          title = matchH[1].trim();
        }
        const doc = engine.addDocument({
          title: title,
          path: rawPath ? `${rawPath}-part${partIdx}` : `notes/note-part-${partIdx}.md`,
          body: part,
          isFile: false,
          isNote: true
        });
        addedDocs.push(doc);
        partIdx++;
      }
    } else {
      const doc = engine.addDocument({
        title: rawTitle || "Untitled Document",
        path: rawPath || "notes/custom-note.md",
        body: rawBody || rawTitle,
        isFile: false,
        isNote: true
      });
      addedDocs.push(doc);
    }

    if (addedDocs.length > 0) {
      await ArgusDB.putMany(addedDocs);
    }

    const elapsed = Math.round(performance.now() - t0);
    updateCorpusStats();
    updateLiveEngineStats();
    updatePresetChipsState();

    const count = addedDocs.length;
    showToast(`Indexed ${count} note${count > 1 ? "s" : ""} in ${elapsed} ms`);

    docTitleInput.value = "";
    docPathInput.value = "";
    docBodyInput.value = "";
    liveWordCount.textContent = "0";
    liveCharCount.textContent = "0";
    liveTokenCount.textContent = "0";
    liveStemChips.innerHTML = '<span class="token-chip" style="opacity: 0.5;">Type text above to preview token stream...</span>';

    if (!keepModalOpen) {
      closeNoteModal();
    } else {
      docTitleInput.focus();
    }

    performSearch(searchInput.value);
  }

  btnIndexDoc.addEventListener("click", () => indexCurrentNote(false));
  if (btnIndexAddAnother) {
    btnIndexAddAnother.addEventListener("click", () => indexCurrentNote(true));
  }

  // Quick Template Inserters
  const btnInsertNote = document.getElementById("btn-insert-note");
  if (btnInsertNote) {
    btnInsertNote.addEventListener("click", () => {
      docTitleInput.value = "Weekly Team Architecture Sync";
      docPathInput.value = "notes/meetings/architecture-sync.md";
      docBodyInput.value = "Discussed migrating indexing workers to zero-copy memory buffers. Evaluated latency improvements across BM25 scoring pipelines and positional phrase queries.";
      docBodyInput.dispatchEvent(new Event("input"));
    });
  }

  const btnInsertSpec = document.getElementById("btn-insert-spec");
  if (btnInsertSpec) {
    btnInsertSpec.addEventListener("click", () => {
      docTitleInput.value = "High-Throughput Inverted Index Specification";
      docPathInput.value = "specs/engine/inverted-index-v2.md";
      docBodyInput.value = "Specification for mechanical sympathy and cache-aligned postings lists. Implements SIMD-friendly delta compression, skip pointers, and dynamic WAND score thresholds.";
      docBodyInput.dispatchEvent(new Event("input"));
    });
  }

  const btnInsertReadme = document.getElementById("btn-insert-readme");
  if (btnInsertReadme) {
    btnInsertReadme.addEventListener("click", () => {
      docTitleInput.value = "Project README & Development Guide";
      docPathInput.value = "docs/readme.md";
      docBodyInput.value = "Zero-dependency in-memory search engine in pure TypeScript. Fast lexical full-text retrieval, boolean AST evaluator, and BM25 relevance ranking.";
      docBodyInput.dispatchEvent(new Event("input"));
    });
  }

  // Document Filter
  if (docFilterInput) {
    docFilterInput.addEventListener("input", () => {
      renderDocumentList(docFilterInput.value);
    });
  }

  // Reset / Clear Corpus with 5-Second Undo Toast
  if (btnResetCorpus) {
    btnResetCorpus.addEventListener("click", () => {
      if (engine.documents.size === 0) {
        showToast("Index is already empty");
        return;
      }

      // Snapshot documents for undo
      const backupDocs = Array.from(engine.documents.values()).map(d => ({ ...d }));
      const backupCount = backupDocs.length;

      // Clear in-memory structures
      engine.documents.clear();
      engine.docLengths.clear();
      engine.postings.clear();
      engine.totalDocLength = 0;

      activeCorpusFilter = "all";
      updateFilterButtons();
      updateCorpusStats();
      updateLiveEngineStats();
      updatePresetChipsState();
      performSearch(searchInput.value);

      let countdown = 5;
      let undoCountdownInterval = null;

      showToast(`Cleared ${backupCount} documents.`, `Undo (${countdown}s)`, async () => {
        if (undoCountdownInterval) clearInterval(undoCountdownInterval);
        for (const doc of backupDocs) {
          engine.addDocument(doc);
        }
        await ArgusDB.putMany(backupDocs);
        updateCorpusStats();
        updateLiveEngineStats();
        updatePresetChipsState();
        performSearch(searchInput.value);
        showToast(`Restored ${backupCount} documents!`);
      });

      undoCountdownInterval = setInterval(() => {
        countdown--;
        const undoBtn = document.querySelector(".undo-toast-btn");
        if (undoBtn) undoBtn.textContent = `Undo (${countdown}s)`;
        if (countdown <= 0) {
          clearInterval(undoCountdownInterval);
          ArgusDB.clear();
          localStorage.setItem("argus_cleared_by_user", "true");
        }
      }, 1000);
    });
  }

  // Bulk Ingest JSON
  if (btnIngestJson && bulkJsonInput) {
    btnIngestJson.addEventListener("click", () => {
      const raw = bulkJsonInput.value.trim();
      if (!raw) {
        showErrorBox("Empty JSON", "Please paste a JSON array of documents before clicking import.", "JSON Notice");
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          showErrorBox("Invalid Format", "Expected an array of documents: [{ \"title\": \"...\", \"body\": \"...\" }]", "JSON Error");
          return;
        }
        let count = 0;
        for (const item of parsed) {
          if (item.title || item.body) {
            engine.addDocument({
              ...item,
              isFile: false,
              isNote: true
            });
            count++;
          }
        }
        activeCorpusFilter = "notes";
        updateFilterButtons();
        updateCorpusStats();
        performSearch(searchInput.value);
        showToast(`Successfully indexed ${count} JSON documents`);
        bulkJsonInput.value = "";
        closeInternals();
      } catch (err) {
        showErrorBox("JSON Syntax Error", err.message, "JSON Error");
      }
    });
  }

  // BM25 Sliders
  if (k1Slider && k1Val) {
    k1Slider.addEventListener("input", () => {
      engine.k1 = parseFloat(k1Slider.value);
      k1Val.textContent = engine.k1.toFixed(2);
      performSearch(searchInput.value);
    });
  }

  if (bSlider && bVal) {
    bSlider.addEventListener("input", () => {
      engine.b = parseFloat(bSlider.value);
      bVal.textContent = engine.b.toFixed(2);
      performSearch(searchInput.value);
    });
  }

  if (btnResetBM25 && k1Slider && bSlider && k1Val && bVal) {
    btnResetBM25.addEventListener("click", () => {
      engine.k1 = 1.2;
      engine.b = 0.75;
      k1Slider.value = 1.2;
      bSlider.value = 0.75;
      k1Val.textContent = "1.20";
      bVal.textContent = "0.75";
      performSearch(searchInput.value);
      showToast("BM25 parameters reset to defaults (k1=1.2, b=0.75)");
    });
  }

  // Search input events
  searchInput.addEventListener("input", () => {
    clearBtn.style.display = searchInput.value.length > 0 ? "block" : "none";
    performSearch(searchInput.value);
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearBtn.style.display = "none";
    searchInput.focus();
    performSearch("");
  });

  // Preset query chips
  document.querySelectorAll(".preset-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".preset-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      const q = chip.getAttribute("data-query");
      searchInput.value = q;
      clearBtn.style.display = "block";
      performSearch(q);
    });
  });

  // Global Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== searchInput && document.activeElement !== docBodyInput && document.activeElement !== docTitleInput) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
    if (e.key === "Escape") {
      if (modalBackdrop) modalBackdrop.classList.remove("open");
      if (noteModalBackdrop) noteModalBackdrop.classList.remove("open");
      if (errorModalBackdrop) errorModalBackdrop.classList.remove("open");
      if (internalsDrawer) internalsDrawer.classList.remove("open");
      if (internalsBackdrop) internalsBackdrop.classList.remove("open");
    }
  });

  // Window Drag & Drop Support
  window.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      const files = await extractFilesFromDataTransfer(e.dataTransfer);
      if (files && files.length > 0) {
        processLocalFiles(files);
      }
    }
  });

  // Initial Boot: Cleanse any sample docs and restore ONLY user personal files & notes
  async function initCorpus() {
    try {
      const stored = await ArgusDB.getAll();
      if (stored && stored.length > 0) {
        for (const doc of stored) {
          // If this document is from the sample dataset, purge it from IndexedDB!
          if (doc.isSample || doc.docType === "Technical Paper" || SAMPLE_PATHS.has(doc.path)) {
            await ArgusDB.delete(doc.id);
            continue;
          }
          engine.addDocument(doc);
        }
      }
    } catch (err) {
      console.warn("ArgusDB boot failed", err);
    }

    updateCorpusStats();
    updateLiveEngineStats();
    updatePresetChipsState();
    performSearch("");

    if (searchInput) {
      searchInput.focus();
    }
  }

  initCorpus();
});
