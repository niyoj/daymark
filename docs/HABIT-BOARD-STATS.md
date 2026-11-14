# Habit Board lifetime stats

This Operate surface extends only the Markdown Habit Board. Empty Daymark blocks now select it; other views keep their explicit options. The Today mini-board and analytics calculations are unchanged.

The four exact labels are Current streak, Longest streak, Days completed, and Completion rate. Wide desktop panes reserve space for four columns beside the date grid; each routine’s cells and stats share one row. Narrow panes and mobile use a 44px routine-name button to toggle one compact section below the board. Each block owns its selection. The title is centered above the four stat columns and completion rate is percentage-only. Date pagination keeps at least seven dates visible, stacking routine names above date cells in very narrow panes, keeping today at the grid’s right edge on first open and after Jump to today. No Rate period selector is rendered.

`lifetimeRoutineStats` calls the existing `streakStats` and `dayStatus` functions over the routine’s full history. It excludes an unfinished today from scheduled-day eligibility. Completing today includes it immediately; once a day ends, its scheduled occurrence stays eligible. Rest days and future dates are excluded. Frozen past days remain scheduled without adding completion credit. Zero eligible days display an em dash. Browsing history never changes the stats’ date scope.

## Verified

- `npm run check`: official Obsidian ESLint rules, strict TypeScript, production bundle, **49 automated tests**, release metadata, and README links passed.
- New pure cases cover 42 of 50 daily occurrences (84%), selected weekdays with partial completion, freezes, correction, today completion/undo, midnight eligibility, no history, future records, and historical schedule revisions.
- Source and production-bundle integration verify the empty-block default, routine selection, stats refresh after check-in, and absence of stats in the Today mini-board.
- `node scripts/board-stats-ui-check.mjs`: passed in light/dark themes at desktop **1200 × 900** and phone widths **390 × 900** and **320 × 900**. The actual usable panes were 664px, 256px, and 186px wide. The compact board shows nine, eight, and seven date columns respectively. Desktop uses four aligned compact stats columns and 30px rows; the narrow pane uses the compact section. The script tests exact labels and counts, Enter/Space activation, emulated touch, no inner scrolling, month-boundary browsing, correction/undo, returning focus to the date cell, new-routine today completion/undo, and Jump to today. Records and saved bytes are restored.
- Existing board layout, history correction, and multi-view Markdown regression scripts passed. Explicit analytics views and invalid-option messaging remain available. The history test now browses to a month boundary because reserving stats space can shorten the current date page.
- Mobile mode forces the compact section even in wider landscape widths; the layout helper is covered by a mobile-flag unit test.

| Theme | Desktop | Phone-width pane |
| --- | --- | --- |
| Light | [Aligned stats](images/routine-stats-light-1200.png) | [Compact section](images/routine-stats-light-390.png) |
| Dark | [Aligned stats](images/routine-stats-dark-1200.png) | [Compact section](images/routine-stats-dark-390.png) |

Phone-width and touch checks use desktop viewport/input emulation. A physical iPhone, VoiceOver, and native iOS safe-area behavior were not tested.
