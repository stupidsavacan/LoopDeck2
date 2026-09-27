import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(repoRoot, 'src');
const entrypoints = [path.join(srcRoot, 'main.ts')];

// Use these only for code with an intentional consumer outside the TypeScript
// program or production import graph. Keep a concrete reason next to every
// exception so dormant production code cannot become an undocumented baseline.
const allowedUnusedExports = new Map([
  // ['src/example.ts#externalApi', 'Consumed by <documented external contract>.'],
]);
const allowedUnreachableModules = new Map([
  // ['src/exampleTestHelper.ts', 'Test-only helper imported by <test suite>.'],
]);

const toPosix = (value) => value.split(path.sep).join('/');
const relativePath = (value) => toPosix(path.relative(repoRoot, value));
const normalize = (value) => path.normalize(path.resolve(value));
const isUnder = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel);
};

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

for (const [key, reason] of [...allowedUnusedExports, ...allowedUnreachableModules]) {
  if (!reason.trim()) fail(`Dead-code allowlist entry needs a reason: ${key}`);
}

const configPath = ts.findConfigFile(repoRoot, ts.sys.fileExists, 'tsconfig.json');
if (!configPath) throw new Error('Could not find tsconfig.json.');
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
}
const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repoRoot);
const scriptFileNames = parsed.fileNames.map(normalize);

const languageServiceHost = {
  getScriptFileNames: () => scriptFileNames,
  getScriptVersion: () => '0',
  getScriptSnapshot(fileName) {
    if (!fs.existsSync(fileName)) return undefined;
    return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, 'utf8'));
  },
  getCurrentDirectory: () => repoRoot,
  getCompilationSettings: () => parsed.options,
  getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
  realpath: ts.sys.realpath
};
const languageService = ts.createLanguageService(languageServiceHost, ts.createDocumentRegistry());
const program = languageService.getProgram();
if (!program) throw new Error('Could not create TypeScript program.');

const sourceFiles = program.getSourceFiles().filter((sourceFile) => {
  const fileName = normalize(sourceFile.fileName);
  return isUnder(fileName, srcRoot) && fileName.endsWith('.ts') && !fileName.endsWith('.d.ts');
});
const sourceFileNames = new Set(sourceFiles.map((sourceFile) => normalize(sourceFile.fileName)));

function exportedIdentifiers(statement) {
  const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
  if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) return [];

  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) =>
      ts.isIdentifier(declaration.name) ? [declaration.name] : []
    );
  }

  if ('name' in statement && statement.name && ts.isIdentifier(statement.name)) return [statement.name];
  return [];
}

const unusedExports = [];
for (const sourceFile of sourceFiles) {
  for (const statement of sourceFile.statements) {
    for (const identifier of exportedIdentifiers(statement)) {
      const key = `${relativePath(sourceFile.fileName)}#${identifier.text}`;
      if (allowedUnusedExports.has(key)) continue;

      const referenceGroups = languageService.findReferences(sourceFile.fileName, identifier.getStart(sourceFile)) ?? [];
      const references = referenceGroups.flatMap((group) => group.references).filter((reference) => !reference.isDefinition);
      if (references.length === 0) {
        const line = sourceFile.getLineAndCharacterOfPosition(identifier.getStart(sourceFile)).line + 1;
        unusedExports.push(`${relativePath(sourceFile.fileName)}:${line} ${identifier.text}`);
      }
    }
  }
}

function collectModuleSpecifiers(sourceFile) {
  const specifiers = [];
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

const moduleResolutionHost = {
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
  realpath: ts.sys.realpath
};
const graph = new Map();
for (const sourceFile of sourceFiles) {
  const from = normalize(sourceFile.fileName);
  const targets = new Set();
  for (const specifier of collectModuleSpecifiers(sourceFile)) {
    const resolved = ts.resolveModuleName(specifier, from, parsed.options, moduleResolutionHost).resolvedModule;
    if (!resolved) continue;
    const target = normalize(resolved.resolvedFileName);
    if (sourceFileNames.has(target)) targets.add(target);
  }
  graph.set(from, targets);
}

const reachable = new Set();
const pending = entrypoints.map(normalize);
while (pending.length) {
  const current = pending.pop();
  if (!current || reachable.has(current)) continue;
  if (!sourceFileNames.has(current)) throw new Error(`Production entrypoint is missing from the TypeScript program: ${relativePath(current)}`);
  reachable.add(current);
  for (const target of graph.get(current) ?? []) pending.push(target);
}

const unreachableModules = [...sourceFileNames]
  .filter((fileName) => !reachable.has(fileName))
  .map(relativePath)
  .filter((fileName) => !allowedUnreachableModules.has(fileName))
  .sort();

if (unusedExports.length || unreachableModules.length || process.exitCode) {
  if (unusedExports.length) {
    console.error('Unused exported TypeScript symbols:');
    for (const item of unusedExports.sort()) console.error(`  - ${item}`);
  }
  if (unreachableModules.length) {
    console.error('TypeScript modules unreachable from src/main.ts:');
    for (const item of unreachableModules) console.error(`  - ${item}`);
  }
  if (!process.exitCode) process.exitCode = 1;
} else {
  console.log(`Dead-code check passed: ${sourceFiles.length} production TypeScript modules are reachable and no unused exports were found.`);
}
