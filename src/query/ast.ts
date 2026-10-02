/**
 * Query AST (Abstract Syntax Tree) node definitions.
 */

export type QueryNodeType =
  | 'TERM'
  | 'PHRASE'
  | 'PREFIX'
  | 'AND'
  | 'OR'
  | 'NOT';

export interface TermNode {
  type: 'TERM';
  value: string;
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
  | PhraseNode
  | PrefixNode
  | AndNode
  | OrNode
  | NotNode;
