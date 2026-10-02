/**
 * Query AST (Abstract Syntax Tree) node definitions.
 */

export type QueryNodeType =
  | 'TERM'
  | 'FUZZY'
  | 'PHRASE'
  | 'PREFIX'
  | 'AND'
  | 'OR'
  | 'NOT';

export interface TermNode {
  type: 'TERM';
  value: string;
}

export interface FuzzyNode {
  type: 'FUZZY';
  term: string;
  maxDistance: number;
}

export interface PhraseNode {
  type: 'PHRASE';
  terms: string[];
  slop?: number;
}

export interface PrefixNode {
  type: 'PREFIX';
  prefix: string;
}

export interface AndNode {
  type: 'AND';
  children: QueryNode[];
}

export interface OrNode {
  type: 'OR';
  children: QueryNode[];
}

export interface NotNode {
  type: 'NOT';
  child: QueryNode;
}

export type QueryNode =
  | TermNode
  | FuzzyNode
  | PhraseNode
  | PrefixNode
  | AndNode
  | OrNode
  | NotNode;

