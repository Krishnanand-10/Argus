import type { QueryNode, AndNode, OrNode, NotNode, TermNode, PhraseNode, PrefixNode } from './ast.js';
import { tokenizeQuery, type QueryToken, type QueryTokenType } from './lexer.js';

/**
 * Recursive-descent AST Parser for boolean search expressions.
 * Supports:
 * - Terms: `database`
 * - Boolean AND (explicit & implicit): `distributed AND consensus` / `distributed consensus`
 * - Boolean OR: `rust OR typescript`
 * - Negation NOT: `engine NOT storage` / `-storage` / `!storage`
 * - Exact Phrases: `"byzantine fault tolerance"`
 * - Wildcards/Prefixes: `distrib*`
 * - Nested parentheses: `(distributed OR decentralized) AND consensus`
 */
export class QueryParser {
  private tokens: QueryToken[] = [];
  private current: number = 0;

  /**
   * Parses a raw query string into an AST QueryNode.
   */
  public parse(query: string): QueryNode {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return { type: 'AND', children: [] };
    }

    this.tokens = tokenizeQuery(trimmed);
    this.current = 0;

    const node = this.parseOr();
    return node;
  }

  private parseOr(): QueryNode {
    let left = this.parseAnd();

    while (this.match('OR')) {
      this.consume(); // consume 'OR'
      const right = this.parseAnd();

      if (left.type === 'OR') {
        left.children.push(right);
      } else {
        left = { type: 'OR', children: [left, right] } as OrNode;
      }
    }

    return left;
  }

  private parseAnd(): QueryNode {
    let left = this.parseNot();

    while (this.isNextAndCandidate()) {
      if (this.match('AND')) {
        this.consume(); // consume explicit 'AND'
      }

      const right = this.parseNot();

      if (left.type === 'AND') {
        left.children.push(right);
      } else {
        left = { type: 'AND', children: [left, right] } as AndNode;
      }
    }

    return left;
  }

  private parseNot(): QueryNode {
    if (this.match('NOT')) {
      this.consume();
      const child = this.parsePrimary();
      return { type: 'NOT', child } as NotNode;
    }

    return this.parsePrimary();
  }

  private parsePrimary(): QueryNode {
    if (this.match('LPAREN')) {
      this.consume(); // consume '('
      const expr = this.parseOr();
      if (this.match('RPAREN')) {
        this.consume(); // consume ')'
      }
      return expr;
    }

    if (this.match('PHRASE')) {
      const token = this.consume();
      // Split phrase into non-whitespace words
      const words = token.value
        .trim()
        .split(/[^\p{L}\p{N}_]+/u)
        .filter((w) => w.length > 0);

      return {
        type: 'PHRASE',
        terms: words,
      } as PhraseNode;
    }

    if (this.match('PREFIX')) {
      const token = this.consume();
      return {
        type: 'PREFIX',
        prefix: token.value,
      } as PrefixNode;
    }

    if (this.match('TERM')) {
      const token = this.consume();
      return {
        type: 'TERM',
        value: token.value,
      } as TermNode;
    }

    // Fallback for unexpected or trailing tokens
    if (!this.isAtEnd()) {
      const token = this.consume();
      return {
        type: 'TERM',
        value: token.value,
      } as TermNode;
    }

    return { type: 'AND', children: [] };
  }

  private isNextAndCandidate(): boolean {
    if (this.isAtEnd()) return false;
    const type = this.peek().type;
    // Explicit AND or implicit next primary expression
    return (
      type === 'AND' ||
      type === 'TERM' ||
      type === 'PHRASE' ||
      type === 'PREFIX' ||
      type === 'NOT' ||
      type === 'LPAREN'
    );
  }

  private match(...types: QueryTokenType[]): boolean {
    if (this.isAtEnd()) return false;
    return types.includes(this.peek().type);
  }

  private consume(): QueryToken {
    if (!this.isAtEnd()) {
      return this.tokens[this.current++]!;
    }
    return this.peek();
  }

  private peek(): QueryToken {
    return this.tokens[this.current] ?? { type: 'EOF', value: '', position: 0 };
  }

  private isAtEnd(): boolean {
    return this.current >= this.tokens.length || this.peek().type === 'EOF';
  }
}
