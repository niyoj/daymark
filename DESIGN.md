# Daymark prototype design

Daymark takes Everyday's row-per-routine, column-per-date board as its starting point. The surrounding interface is designed for Obsidian: a quiet sidebar, compact native typography, and surfaces that follow the user's light or dark theme. Everyday green identifies actions; each routine uses one of Everyday's seven base colors.

The Today sidebar leads with its heading and a clear completion summary, then shows routine groups. Completed tasks stay visible, preserving a trustworthy account of today's work. The board uses the same routine colors and an increasing intensity for consecutive completions. Unscheduled cells are outlined with a dot, partial cells are half filled, and frozen cells have a pale blue border. Color is accompanied by date-detail text and accessible labels.

## Implementation contract

- Set `--dm-color` on each routine and board row to its color.
- Set `--dm-cell-color` to the exact reference shade for a completed cell’s streak length. `--dm-intensity` remains the fallback for custom colors.
- Set the progress fill width directly to the completed percentage.
- Use `is-done` on the check indicator and task container for completed tasks.
- `dm-board-row` uses a sticky first label followed by auto-placed date cells. Use the same structure for the date heading.
- Every interactive control needs a descriptive label. Weekday/color buttons use `aria-pressed`; task buttons use `aria-pressed` or a native checkbox. Label board cells with routine, local date, and state.
- Task rows provide a 47px touch target. On mobile weekday controls increase to 44px. Dense board cells remain compact for comparison; tapping opens date details with full-size controls.
- Long names wrap in checklist cards and truncate in sticky board labels; the accessible label retains the complete name.

## Review checklist

Verify both Obsidian themes, a 320px sidebar, long routine/task names, zero routines, no tasks due today, and all tasks complete. Verify the Markdown Habit Board fits complete date columns and pages by arrow buttons without internal scrolling; the sidebar mini-board retains its existing scrolling behavior. Test keyboard focus and reduced-motion settings. Never use a future date as an editable check-in. Explain the monthly freeze allowance beside the freeze action.

Desktop rendering and plugin interactions are verified in an isolated Obsidian instance (currently 1.15.1). Actual iPhone rendering and iOS file access remain unverified.

## Color reference

On 2026-11-14, colors were checked against [Everyday’s public web app](https://app.everyday.app) and its [published application bundle](https://app.everyday.app/static/js/main.e847f82e.js). Green `#249c03`, blue `#249cff`, orange `#ffa503`, red `#ff0000`, purple `#a64ca6`, grey `#888888`, and teal `#329999` are the base palette. Completed cells use its exact light-to-deep shade arrays, advancing one shade per scheduled-day completion and clamping at the darkest shade. The green action accent is `#249c03` in light mode and `#2fcf03` in dark mode. Surfaces follow the Obsidian theme. Existing custom routine colors remain supported through the tint fallback.

## Calendar Overview refinement

Calendar Overview follows the existing Habit Board visual system: 27px squares with 4px gaps, green `#249c03`, centered range navigation, and Jump to today. Date-of-today headline rows are omitted across views. Green intensity represents **completion rate**, while the main Habit Board retains streak shading. Unscheduled dates stay distinct from scheduled zeroes; freezes remain an independent ice-blue marker. Week labels run W1–W5 (or W6 for a partial boundary week when needed) below the grid and restart per month band. The calendar adds older week columns to fill the available pane width, keeping 27px cells and 4px gutters. Month bands use the week containing the first day of each new month, and the first-of-month cell receives its own border. Weekday names remain on the left. Date/count tooltips replace the persistent bottom task panel. The routine editor retains its implementation and appearance.

## Habit Board pagination

Only the Markdown `view: habit-board` now uses width-aware date pages, with up to 28 days and a smaller count in narrow panes. Cells remain 27px with 4px gutters, routine labels remain visible, and the existing month/streak treatments are preserved. Left/right arrows move one visible page; Jump to today restores the current page. The board grows to show all routine rows, relying on normal note scrolling rather than an internal scroll viewport. Calendar Overview and the Today sidebar retain their existing presentation.

## Routine analytics refinement

Weekly Consistency and Weekday Patterns now share Calendar Overview’s green completion-rate shading, 27px squares, bottom axis labels, compact range navigation, and Jump to today. They omit descriptive captions and persistent bottom detail cards. Exact counts and freeze usage remain in native tooltips and accessible labels. Weekly Consistency preserves Monday-based buckets, shows month bands, restarts week numbering per month, and adds history columns on wider panes. Weekday Patterns preserves its seven weekday buckets, distributes those columns across desktop space, and places each routine name above its seven cells on narrow panes. Every block keeps its own date window and selection through refreshes. Completion/streak calculations are unchanged.

## Today and cell-detail polish

This refinement is limited to the Today checklist and selected-cell inspection. Today has one New routine action, per-routine completion counts, remaining tasks before completed tasks, and explicit check icons, strikethrough, and Done labels. Long task names wrap; native theme surfaces and text variables keep both themes readable. Checklist and detail actions are at least 44px high. Check-ins retain keyboard focus through subscribed rerenders and expose a busy state while saving. Failed writes retain the prior record and restore the action.

Every heatmap opens a compact Obsidian dialog with protected keyboard focus. Routine-date details lead with the historically correct routine name and full date, exact task count, and editable checklist. Freeze allowance and its effect stay beside the existing action. Aggregated weekday/week details show the routine, period, exact numerator/denominator and percentage; freezes remain separate from completion credit. Calendar details show only due routines, their task counts/status and freeze usage, with a route to existing routine-day correction. Escape and Done return focus to the originating cell, including after a subscribed grid replacement. No persistent detail panel returns beneath the grids.

The grids, palette, headers, range navigation, Markdown options, schedule/streak calculations, and freeze rules retain their existing implementations. The routine editor is outside this pass. See [verification](CONTRIBUTING.md).

## Habit Board routine stats

The default empty Markdown block now renders Habit Board. Only its paginated Markdown renderer adds Routine stats; the Today mini-board and analytics views retain their own presentation and calculations. When the pane fits at least seven dates plus four stat columns on desktop, the stats share each routine’s grid row. The Routine stats title is centered over those columns. Date pagination reserves the columns’ width while keeping at least seven dates visible. Very narrow panes put routine names above the date cells; cells retain 27px size when space permits. Completion rate is percentage-only. Narrow panes and mobile devices use 44px routine-name buttons and one compact, selected-routine section below the board, independent for each block. Selection survives paging and refreshes.

Stats reuse `streakStats` over full history. Completion-rate eligibility subtracts an unfinished today; prior scheduled dates, including freezes, stay in the denominator. Completing today includes it immediately. A zero denominator shows an em dash. Date-range navigation never changes lifetime stats. The mode of this surface is Operate: retain the palette, date/month headers, corrections, and Jump to today while making lifetime counts readable.

The desktop stats table uses compact 56/56/64/64px columns and 30px routine rows, with 13px tabular numerals and 11px wrapped labels. This keeps more date history visible without changing the seven-date minimum. The centered title, percentage-only rate, theme variables, and mobile 44px name targets are preserved.
