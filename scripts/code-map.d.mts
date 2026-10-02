import type { Node } from 'typescript';

export interface CodeMapFile {
  path: string;
  contentHash: string;
  imports: { specifier: string; resolved: string | null; dynamic?: boolean }[];
  exports: string[];
  functions: { name: string; startLine: number; endLine: number; bodyHash: string }[];
}

export function functionBodyHash(node: Node): string;
export function createCodeMap(): { version: number; entrypoints: string[]; files: CodeMapFile[] };
