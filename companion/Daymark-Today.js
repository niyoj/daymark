// Daymark Today for Scriptable.
// Bookmark the JSON file or its containing folder as "Daymark Widget".
const bookmarkName = "Daymark Widget";
const exportFile = "habit-widget.json";
const previewSize = "large"; // Use "small" to preview the 2 × 2 layout.

const colors = {
  background: "#1B2A24",
  text: "#F5FAF3",
  muted: "#BFCFC2",
  accent: "#C7ED9B",
  track: "#475A4E",
  row: "#2C3A33",
};

function localDateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function isTask(task) {
  return task && typeof task.name === "string" && task.name.trim().length > 0;
}

async function readSnapshot() {
  const files = FileManager.local();
  try {
    if (!files.bookmarkExists(bookmarkName)) {
      return { title: "Connect Daymark", detail: "Add the Daymark Widget bookmark in Scriptable." };
    }
    const target = files.bookmarkedPath(bookmarkName);
    const path = files.isDirectory(target) ? files.joinPath(target, exportFile) : target;
    if (!files.fileExists(path)) {
      return { title: "Export missing", detail: "Open Daymark to refresh the widget export." };
    }
    if (files.isFileStoredIniCloud(path) && !files.isFileDownloaded(path)) {
      await files.downloadFileFromiCloud(path);
    }
    const snapshot = JSON.parse(files.readString(path));
    if (snapshot?.version !== 1 || typeof snapshot.date !== "string" ||
        !Array.isArray(snapshot.remaining) || !snapshot.remaining.every(isTask) ||
        !Array.isArray(snapshot.completed) || !snapshot.completed.every(isTask)) {
      return { title: "Export unavailable", detail: "Open Daymark to regenerate the widget export." };
    }
    return { snapshot };
  } catch (error) {
    console.log(String(error));
    return { title: "Can’t read export", detail: "Check the Daymark Widget bookmark and try again." };
  }
}

function label(container, value, size, color, weight = "regular", lines = 1) {
  const item = container.addText(value);
  item.font = weight === "bold" ? Font.boldSystemFont(size)
    : weight === "semibold" ? Font.semiboldSystemFont(size)
    : Font.systemFont(size);
  item.textColor = new Color(color);
  item.lineLimit = lines;
  item.minimumScaleFactor = 0.8;
  return item;
}

function progressRing(size, ratio) {
  const canvas = new DrawContext();
  canvas.size = new Size(size, size);
  canvas.opaque = false;
  canvas.respectScreenScale = true;

  const width = size >= 60 ? 5 : 4;
  const half = size / 2;
  const radius = half - width / 2 - 2;
  canvas.setLineWidth(width);
  canvas.setStrokeColor(new Color(colors.track));
  canvas.strokeEllipse(new Rect(half - radius, half - radius, radius * 2, radius * 2));

  if (ratio > 0) {
    const steps = Math.max(2, Math.ceil(ratio * 64));
    const points = Array.from({ length: steps + 1 }, (_, i) => {
      const angle = -Math.PI / 2 + 2 * Math.PI * ratio * i / steps;
      return new Point(half + radius * Math.cos(angle), half + radius * Math.sin(angle));
    });
    const path = new Path();
    path.addLines(points);
    canvas.addPath(path);
    canvas.setStrokeColor(new Color(colors.accent));
    canvas.strokePath();

    canvas.setFillColor(new Color(colors.accent));
    for (const point of [points[0], points[points.length - 1]]) {
      canvas.fillEllipse(new Rect(point.x - width / 2, point.y - width / 2, width, width));
    }
  }

  const fontSize = size >= 60 ? 17 : 10;
  canvas.setFont(Font.boldSystemFont(fontSize));
  canvas.setTextColor(new Color(colors.text));
  canvas.setTextAlignedCenter();
  canvas.drawTextInRect(
    Math.round(ratio * 100) + "%",
    new Rect(0, half - fontSize * 0.65, size, fontSize * 1.5)
  );
  return canvas.getImage();
}

function addStreakColumn(row, value, color) {
  const column = row.addStack();
  column.layoutHorizontally();
  column.centerAlignContent();
  column.size = new Size(65, 0);
  column.addSpacer();
  label(column, value, 11, color, "semibold");
}

function addRemainingTask(widget, task, compact) {
  const row = widget.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  if (!compact) {
    row.backgroundColor = new Color(colors.row);
    row.cornerRadius = 8;
    row.setPadding(4, 8, 4, 8);
  }

  const dot = row.addStack();
  dot.size = new Size(5, 5);
  dot.cornerRadius = 3;
  const validColor = typeof task.color === "string" && /^#[a-f\d]{6}$/i.test(task.color);
  dot.backgroundColor = new Color(validColor ? task.color : colors.accent);
  row.addSpacer(5);

  const text = row.addStack();
  text.layoutVertically();
  label(text, task.name.trim(), compact ? 11 : 12, colors.text, "semibold");
  if (!compact && typeof task.routine === "string" && task.routine.trim()) {
    label(text, task.routine.trim(), 10, colors.muted);
  }

  row.addSpacer(5);
  row.addSpacer();
  const days = task.projectedStreak;
  const hasStreak = Number.isSafeInteger(days) && days > 0;
  if (!compact) {
    const streak = hasStreak ? "→ " + days + (days === 1 ? " day" : " days") : "—";
    addStreakColumn(row, streak, hasStreak ? colors.accent : colors.muted);
  } else if (hasStreak) {
    label(row, "→ " + days + "d", 10, colors.accent, "semibold");
  }
}

function buildWidget(result, family, now) {
  const widget = new ListWidget();
  widget.backgroundColor = new Color(colors.background);

  const large = family === "large" || family === "extraLarge";
  const padding = large ? 16 : 11;
  widget.setPadding(padding, padding, padding, padding);
  widget.spacing = 0;
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  widget.refreshAfterDate = new Date(Math.min(now.getTime() + 15 * 60 * 1000, midnight.getTime()));

  const header = widget.addStack();
  header.layoutHorizontally();
  label(header, "Daymark · Today", large ? 13 : 11, colors.accent, "semibold");
  header.addSpacer();
  const date = new DateFormatter();
  date.dateFormat = large ? "EEE, MMM d" : "MMM d";
  label(header, date.string(now), large ? 11 : 10, colors.muted);

  const snapshot = result.snapshot;
  if (!snapshot || snapshot.date !== localDateKey(now)) {
    widget.addSpacer();
    label(widget, snapshot ? "Out of date" : result.title, 16, colors.text, "bold", 2);
    widget.addSpacer(5);
    label(widget, snapshot ? "Open Daymark to refresh today’s progress." : result.detail, 11, colors.muted, "regular", 3);
    widget.addSpacer();
    return widget;
  }

  const completed = snapshot.completed.length;
  const remaining = snapshot.remaining.length;
  const total = completed + remaining;
  widget.addSpacer(large ? 12 : 5);

  const progress = widget.addStack();
  progress.layoutHorizontally();
  progress.centerAlignContent();
  const summary = progress.addStack();
  summary.layoutVertically();
  label(summary, total ? completed + " / " + total + " done" : "No tasks due", large ? 29 : 18, colors.text, "bold");
  if (total) {
    label(summary, remaining ? remaining + " left today" : "All done today", large ? 13 : 10, colors.muted);
    progress.addSpacer(5);
    progress.addSpacer();
    const ringSize = large ? 62 : 40;
    progress.addImage(progressRing(ringSize, completed / total)).imageSize = new Size(ringSize, ringSize);
  }

  if (remaining) {
    const rowLimit = large ? (Device.isPad() ? 5 : 4) : 2;
    const shown = snapshot.remaining.slice(0, rowLimit);
    widget.addSpacer(large ? 11 : 5);
    const subhead = widget.addStack();
    subhead.layoutHorizontally();
    label(subhead, "Up next", large ? 12 : 10, colors.muted, "semibold");

    const hasStreaks = shown.some(task => Number.isSafeInteger(task.projectedStreak) && task.projectedStreak > 0);
    if (large) {
      subhead.setPadding(0, 8, 0, 8);
      subhead.addSpacer();
      addStreakColumn(subhead, "If done", colors.muted);
    } else if (hasStreaks) {
      subhead.addSpacer();
      label(subhead, "If done", 10, colors.muted);
    }

    shown.forEach(task => {
      widget.addSpacer(large ? 4 : 2);
      addRemainingTask(widget, task, !large);
    });
    if (remaining > shown.length) {
      widget.addSpacer(large ? 5 : 3);
      label(widget, "+" + (remaining - shown.length) + " more", 10, colors.muted);
    }
  }

  widget.addSpacer();
  return widget;
}

const result = await readSnapshot();
const widget = buildWidget(result, config.widgetFamily || previewSize, new Date());
if (config.runsInWidget) {
  Script.setWidget(widget);
} else if (previewSize === "small") {
  await widget.presentSmall();
} else {
  await widget.presentLarge();
}
Script.complete();
