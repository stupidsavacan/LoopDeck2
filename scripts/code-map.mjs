import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const root = process.cwd();
const configPath = path.join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
if (parsed.errors.length) throw new Error(parsed.errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'));
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const sourceRoot = path.join(root, 'src');
const relativePath = value => path.relative(root, value).split(path.sep).join('/');
const hash = value => createHash('sha256').update(value).digest('hex');
const cache = ts.createModuleResolutionCache(root, value => value, parsed.options);

export function functionBodyHash(node) {
  function syntax(value) {
    const result = { kind: value.kind };
    if (ts.isIdentifier(value) || ts.isLiteralExpression(value) || ts.isTemplateHead(value) || ts.isTemplateMiddle(value) || ts.isTemplateTail(value)) result.text = value.text;
    if (ts.isTemplateLiteralToken(value)) result.rawText = value.rawText;
    if (ts.isVariableDeclarationList(value)) result.flags = value.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const | ts.NodeFlags.Using | ts.NodeFlags.AwaitUsing);
    if (ts.isPrefixUnaryExpression(value) || ts.isPostfixUnaryExpression(value)) result.operator = value.operator;
    result.children = [];
    ts.forEachChild(value, child => { result.children.push(syntax(child)); });
    return result;
  }
  return hash(JSON.stringify(syntax(node)));
}

function functionName(node) {
  if (node.name) return node.name.getText();
  if (ts.isVariableDeclaration(node.parent)) return node.parent.name.getText();
  if (ts.isPropertyAssignment(node.parent)) return node.parent.name.getText();
  return undefined;
}

function describeSource(source) {
  const imports = [];
  const functions = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      const resolved = ts.resolveModuleName(specifier, source.fileName, parsed.options, ts.sys, cache).resolvedModule;
      imports.push({ specifier, resolved: resolved ? relativePath(resolved.resolvedFileName) : null });
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
      const specifier = node.arguments[0].text;
      const resolved = ts.resolveModuleName(specifier, source.fileName, parsed.options, ts.sys, cache).resolvedModule;
      imports.push({ specifier, resolved: resolved ? relativePath(resolved.resolvedFileName) : null, dynamic: true });
    }
    if (ts.isFunctionLike(node) && node.body) {
      const name = functionName(node);
      if (name) functions.push({
        name,
        startLine: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        endLine: source.getLineAndCharacterOfPosition(node.end).line + 1,
        bodyHash: functionBodyHash(node.body)
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  const symbol = checker.getSymbolAtLocation(source);
  const exports = symbol ? checker.getExportsOfModule(symbol).map(item => item.name).sort() : [];
  return { path: relativePath(source.fileName), contentHash: hash(source.text), imports, exports, functions };
}

export function createCodeMap() {
  const files = program.getSourceFiles().filter(source => {
  const relative = path.relative(sourceRoot, source.fileName);
  return relative !== '' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative) && !source.isDeclarationFile;
}).map(describeSource).sort((a, b) => a.path.localeCompare(b.path, 'en'));
  return { version: 1, entrypoints: ['src/main.ts'], files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = createCodeMap();
  const outputPath = path.join(root, '.codex-code-map.json');
  writeFileSync(outputPath, JSON.stringify(index, null, 2) + '\n');
  console.log(`Code map: ${relativePath(outputPath)} (${index.files.length} modules, ${index.files.reduce((count, file) => count + file.functions.length, 0)} named functions).`);
}
