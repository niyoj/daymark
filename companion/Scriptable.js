// Daymark — read-only Home Screen companion.
// In Scriptable Settings > File Bookmarks, add the exported JSON as "Daymark".
// Or put the JSON at iCloud Drive/Scriptable/habit-widget.json.
// The optional widget parameter overrides the bookmark name.
const BOOKMARK = args.widgetParameter || 'Daymark';
const FALLBACK_FILE = 'habit-widget.json';
const OPEN_URL = 'obsidian://open';

const fm = FileManager.iCloud();
const widget = new ListWidget();
widget.backgroundColor = Color.dynamic(new Color('#ffffff'), new Color('#121212'));
widget.setPadding(16, 17, 14, 17);
widget.url = OPEN_URL;
widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
const ink = Color.dynamic(new Color('#212121'), new Color('#ffffff'));
const muted = Color.dynamic(new Color('#6f7a80'), new Color('#a8afb3'));
const accent = Color.dynamic(new Color('#249c03'), new Color('#2fcf03'));
function text(value, size = 12, color = ink, bold = false) {
  const label = widget.addText(String(value));
  label.font = bold ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  label.textColor = color;
  label.lineLimit = 1;
  return label;
}
function dateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

text('DAYMARK', 11, accent, true);
widget.addSpacer(7);
try {
  const path = fm.bookmarkExists(BOOKMARK)
    ? fm.bookmarkedPath(BOOKMARK)
    : fm.joinPath(fm.documentsDirectory(), FALLBACK_FILE);
  if (!fm.fileExists(path)) throw new Error('Snapshot missing');
  await fm.downloadFileFromiCloud(path);
  const snapshot = JSON.parse(fm.readString(path));
  if (!snapshot || typeof snapshot.date !== 'string' || !Array.isArray(snapshot.remaining) || !Array.isArray(snapshot.completed)) {
    throw new Error('Snapshot format not supported');
  }
  const updated = new Date(snapshot.updatedAt);
  const age = Date.now() - updated.getTime();
  const sameDay = snapshot.date === dateKey(new Date());
  const stale = !Number.isFinite(age) || age > 2 * 60 * 60 * 1000 || age < -5 * 60 * 1000;
  // Always display the actual snapshot date, even before iOS refreshes after midnight.
  text(snapshot.date, 11, muted);
  text(sameDay ? `${snapshot.remaining.length} remaining` : 'Open Obsidian to refresh', 19, ink, true);
  widget.addSpacer(7);
  const maxRows = config.widgetFamily === 'large' ? 9 : config.widgetFamily === 'small' ? 2 : 3;
  const tasks = snapshot.remaining.slice(0, maxRows);
  for (const task of tasks) text(`○ ${task.name || task.taskName || 'Task'}`, 12);
  if (snapshot.remaining.length > maxRows) text(`+ ${snapshot.remaining.length - maxRows} more`, 11, muted);
  if (!snapshot.remaining.length) text(sameDay ? 'Everything scheduled is done.' : 'Previous snapshot complete.', 12, muted);
  widget.addSpacer();
  text(`${snapshot.completed.length} completed${sameDay ? '' : ' in snapshot'}`, 11, muted);
  if (!sameDay) text('Earlier snapshot · check current tasks in Obsidian', 10, accent);
  else if (stale) text('Snapshot may be stale · open Obsidian', 10, accent);
  else text(`Updated ${updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, 10, muted);
} catch (error) {
  text('Connect your habits', 19, ink, true);
  widget.addSpacer(8);
  const help = text('Export habit-widget.json, then add a Daymark file bookmark in Scriptable.', 12, muted);
  help.lineLimit = 4;
  widget.addSpacer();
  text('Tap to open Obsidian', 11, accent);
  console.warn(`Daymark: ${error.message}`);
}
Script.setWidget(widget);
if (!config.runsInWidget) await widget.presentMedium();
Script.complete();
