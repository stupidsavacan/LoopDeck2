import { toast as showToast } from '../ui/dom';
import { writeDebugLog, type DebugLogLevel } from './debugLog';

interface ReportIssueOptions {
  level: DebugLogLevel;
  area: string;
  code?: string;
  userMessage: string;
  detail?: string;
  error?: unknown;
  context?: Record<string, unknown>;
  toast?: boolean;
}

function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

function errorDetail(error: unknown): string | undefined {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return error === undefined ? undefined : String(error);
}

export function reportIssue(options: ReportIssueOptions): void {
  writeDebugLog({
    level: options.level,
    area: options.area,
    code: options.code,
    userMessage: options.userMessage,
    detail: options.detail ?? errorDetail(options.error),
    stack: errorStack(options.error),
    context: options.context
  });

  if (options.toast !== false) {
    showToast(options.userMessage);
  }
}
