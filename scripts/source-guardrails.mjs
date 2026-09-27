import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const mode = process.argv[2] ?? 'lint';
const root = process.cwd();
const srcRoot = join(root, 'src');
const files = [];

const configPath = join(root, 'tsconfig.json');
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  console.error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  process.exit(1);
}
const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
const checker = program.getTypeChecker();

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(path);
  }
}

walk(srcRoot);

const errors = [];
const warnings = [];
const FILE_WARNING_LINES = 350;
const FUNCTION_WARNING_LINES = 180;

function loc(sourceFile, node) {
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${relative(root, sourceFile.fileName)}:${pos.line + 1}:${pos.character + 1}`;
}

function functionName(node) {
  if ('name' in node && node.name && ts.isIdentifier(node.name)) return node.name.text;
  if (ts.isMethodDeclaration(node) && node.name) return node.name.getText();
  return '<anonymous>';
}

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const source = program.getSourceFile(file) ?? ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const fileLines = text.split(/\r?\n/).length;
  if (fileLines > FILE_WARNING_LINES) warnings.push(`${relative(root, file)} has ${fileLines} lines (manual review threshold: ${FILE_WARNING_LINES}).`);

  if (/\/\/\s*@ts-(?:ignore|expect-error)|\/\*[\s\S]*?@ts-(?:ignore|expect-error)/.test(text)) {
    errors.push(`${relative(root, file)} contains @ts-ignore/@ts-expect-error.`);
  }

  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) errors.push(`${loc(source, node)} uses explicit any.`);
    if (ts.isNonNullExpression(node)) errors.push(`${loc(source, node)} uses a non-null assertion.`);
    if (ts.isDebuggerStatement(node)) errors.push(`${loc(source, node)} contains debugger.`);

    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const type = checker.getTypeAtLocation(node.expression);
      if (checker.getPropertyOfType(type, 'then')) {
        errors.push(`${loc(source, node)} discards a Promise; await it or prefix it with void to mark the discard intentional.`);
      }
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const owner = node.expression.expression.getText(source);
      const method = node.expression.name.text;
      if (owner === 'console' && ['log', 'debug', 'trace'].includes(method)) {
        errors.push(`${loc(source, node)} contains console.${method}().`);
      }
    }

    if (ts.isFunctionLike(node) && node.body) {
      const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const end = source.getLineAndCharacterOfPosition(node.end).line + 1;
      const length = end - start + 1;
      if (length > FUNCTION_WARNING_LINES) {
        warnings.push(`${loc(source, node)} ${functionName(node)} spans ${length} lines (manual review threshold: ${FUNCTION_WARNING_LINES}).`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
}

if (mode === 'report') {
  if (warnings.length === 0) console.log('No readability hotspots above the review thresholds.');
  else {
    console.log('Readability hotspots (informational only):');
    for (const warning of warnings) console.log(`- ${warning}`);
  }
  process.exit(0);
}

for (const warning of warnings) console.warn(`warning: ${warning}`);
if (errors.length > 0) {
  console.error('Source guardrail violations:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Source guardrails passed across ${files.length} TypeScript source files.`);
