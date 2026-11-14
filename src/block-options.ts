/** One query parser shared by both the canonical fence and its legacy alias. */
export const BLOCK_VIEWS = ['weekday-patterns', 'weekly-consistency', 'calendar-overview', 'habit-board'] as const;
export type BlockView = typeof BLOCK_VIEWS[number];
export type BlockOptions = { view: BlockView; error?: never } | { error: string; view?: never };
export function parseBlockOptions(source: string): BlockOptions {
  let view: string | undefined;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^view\s*:\s*(.*)$/.exec(line);
    if (!match) return { error: 'Use a view: option to select a Daymark view.' };
    if (view !== undefined) return { error: 'Use only one view: option per block.' };
    view = match[1].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  if (view === undefined) return { view: 'habit-board' };
  return BLOCK_VIEWS.includes(view as BlockView) ? { view: view as BlockView } : { error: `Unknown Daymark view: ${view || '(empty)'}.` };
}
