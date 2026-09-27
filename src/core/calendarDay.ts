/**
 * LoopDeck's study-day policy is the device-local calendar day.
 * Analytics and SRS due-today buckets must use the same local-midnight boundary.
 */
export function localCalendarDayKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function startOfLocalCalendarDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

export function endOfLocalCalendarDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + 1).getTime() - 1;
}

export function recentLocalCalendarDayKeys(days: number, now: Date): string[] {
  const safeDays = Math.max(1, Math.floor(days));
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Array.from({ length: safeDays }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (safeDays - index - 1));
    return localCalendarDayKey(date);
  });
}
