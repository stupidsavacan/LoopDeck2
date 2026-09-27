import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';

const write = process.argv.includes('--write');
const supported = /\.(?:css|html|json|md|mjs|ts|ya?ml)$/i;
const prettierVersion = '3.9.9';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function lines(value) {
  return value ? value.split(/\r?\n/).filter(Boolean) : [];
}

function changedFiles() {
  if (process.env.GITHUB_BASE_REF) {
    return lines(git(['diff', '--name-only', '--diff-filter=ACMR', `origin/${process.env.GITHUB_BASE_REF}...HEAD`]));
  }

  if (process.env.CI) {
    try {
      return lines(git(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD^...HEAD']));
    } catch {
      return [];
    }
  }

  const files = new Set([
    ...lines(git(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'])),
    ...lines(git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])),
    ...lines(git(['ls-files', '--others', '--exclude-standard']))
  ]);
  return [...files];
}

const files = changedFiles().filter((file) => supported.test(file) && existsSync(file));
if (files.length === 0) {
  console.log('No changed files require formatting checks.');
  process.exit(0);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const action = write ? '--write' : '--check';
execFileSync(npx, ['--yes', `prettier@${prettierVersion}`, action, '--ignore-path', '.prettierignore', ...files], {
  stdio: 'inherit'
});
