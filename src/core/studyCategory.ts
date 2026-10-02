/** Tagged selector values keep a pack-authored category separate from "all". */
export function encodeStudyCategory(category: string): string {
  return JSON.stringify(['category', category.trim()]);
}

export function decodeStudyCategory(value?: string): string | undefined {
  if (!value || value === 'all') return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.length === 2 && parsed[0] === 'category' && typeof parsed[1] === 'string') {
      return parsed[1].trim() || undefined;
    }
  } catch {
    // Older callers used an unencoded category string.
  }
  return value.trim() || undefined;
}
