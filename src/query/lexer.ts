/**
 * Query Lexer token types.
 */
export type QueryTokenType =
  | 'TERM'
  | 'PHRASE'
  | 'PREFIX'
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'LPAREN'
  | 'RPAREN'
  | 'EOF';

/**
 * A token produced by the query scanner.
 */
export interface QueryToken {
  type: QueryTokenType;
  value: string;
  position: number;
}

/**
 * Scans a query string into a stream of tokens for recursive-descent parsing.
 */
export function tokenizeQuery(query: string): QueryToken[] {
  const tokens: QueryToken[] = [];
  let i = 0;
  const len = query.length;

  while (i < len) {
    const char = query[i]!;

    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Parentheses
    if (char === '(') {
      tokens.push({ type: 'LPAREN', value: '(', position: i });
      i++;
      continue;
    }

    if (char === ')') {
      tokens.push({ type: 'RPAREN', value: ')', position: i });
      i++;
      continue;
    }

    // Explicit Operators
    if (char === '&' && query[i + 1] === '&') {
      tokens.push({ type: 'AND', value: '&&', position: i });
      i += 2;
      continue;
    }

    if (char === '|' && query[i + 1] === '|') {
      tokens.push({ type: 'OR', value: '||', position: i });
      i += 2;
      continue;
    }

    if (char === '!') {
      tokens.push({ type: 'NOT', value: '!', position: i });
      i++;
      continue;
    }

    // Leading '-' as NOT operator when followed by non-whitespace
    if (char === '-' && i + 1 < len && !/\s/.test(query[i + 1]!)) {
      tokens.push({ type: 'NOT', value: '-', position: i });
      i++;
      continue;
    }

    // Quoted exact phrases ("phrase" or 'phrase')
    if (char === '"' || char === "'") {
      const quoteChar = char;
      const startPos = i;
      i++; // skip opening quote
      let phraseContent = '';

      while (i < len) {
        const c = query[i]!;
        if (c === '\\' && i + 1 < len) {
          // Escaped character
          phraseContent += query[i + 1]!;
          i += 2;
        } else if (c === quoteChar) {
          i++; // skip closing quote
          break;
        } else {
          phraseContent += c;
          i++;
        }
      }

      tokens.push({
        type: 'PHRASE',
        value: phraseContent,
        position: startPos,
      });
      continue;
    }

    // Identifiers, terms, keywords, and wildcards
    const startPos = i;
    let word = '';

    while (i < len) {
      const c = query[i]!;
      if (
        /\s/.test(c) ||
        c === '(' ||
        c === ')' ||
        c === '"' ||
        c === "'" ||
        (c === '&' && query[i + 1] === '&') ||
        (c === '|' && query[i + 1] === '|')
      ) {
        break;
      }
      word += c;
      i++;
    }

    if (word.length === 0) {
      i++;
      continue;
    }

    // Keyword detection
    const upper = word.toUpperCase();
    if (upper === 'AND') {
      tokens.push({ type: 'AND', value: word, position: startPos });
    } else if (upper === 'OR') {
      tokens.push({ type: 'OR', value: word, position: startPos });
    } else if (upper === 'NOT') {
      tokens.push({ type: 'NOT', value: word, position: startPos });
    } else if (word.endsWith('*') && word.length > 1) {
      // Prefix wildcard: distrib*
      tokens.push({
        type: 'PREFIX',
        value: word.slice(0, -1),
        position: startPos,
      });
    } else {
      tokens.push({
        type: 'TERM',
        value: word,
        position: startPos,
      });
    }
  }

  tokens.push({ type: 'EOF', value: '', position: len });
  return tokens;
}
