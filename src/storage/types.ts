/**
 * Magic bytes header identifying the Argus binary format: "ARGS" (0x41 0x52 0x47 0x53)
 */
export const MAGIC_BYTES = new Uint8Array([0x41, 0x52, 0x47, 0x53]);

/**
 * Current version of the .argus binary file format.
 */
export const FORMAT_VERSION = 1;

/**
 * Byte length of the fixed binary header.
 */
export const HEADER_SIZE = 36;

/**
 * Parsed binary file header containing global corpus statistics and table pointers.
 */
export interface BinaryHeader {
  /** Format version tag */
  version: number;
  /** Reserved format flags */
  flags: number;
  /** Total number of indexed documents (N) */
  totalDocuments: number;
  /** Total tokens indexed across all documents */
  totalTokens: number;
  /** Average document length (avgdl) */
  averageDocLength: number;
  /** Number of unique terms in the lexicon */
  termCount: number;
  /** Byte offset to the Lexicon dictionary table */
  lexiconOffset: number;
  /** Byte offset to the Documents metadata table */
  documentsOffset: number;
  /** Total byte size of the binary index */
  totalFileSize: number;
}

/**
 * Serialized lexicon entry describing a term and its postings blob location.
 */
export interface SerializedLexiconEntry {
  /** The normalized term string */
  term: string;
  /** Document frequency (df) */
  docFrequency: number;
  /** Total term frequency (ttf) */
  totalTermFrequency: number;
  /** Byte offset of the compressed postings blob in the file */
  postingsOffset: number;
  /** Byte length of the compressed postings blob */
  postingsLength: number;
}

/**
 * Operation entry in the Write-Ahead Log (WAL).
 */
export interface WALEntry {
  /** Sequential operation counter */
  sequenceNumber: number;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Type of mutation */
  type: 'INSERT' | 'CHECKPOINT';
  /** Document payload if type is INSERT */
  payload?: Record<string, unknown>;
}
