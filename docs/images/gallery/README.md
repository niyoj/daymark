# Community gallery screenshots

These screenshots show **Daymark Habits 0.2.1** running in Obsidian with fictional demo records. The files in the two folders below are ready for the Community directory gallery.

| Set | Dimensions | Ratio | Format | Limit |
| --- | --- | --- | --- | --- |
| [Desktop](desktop/) | 1200 × 800 px | 3:2 | PNG | Each file under 5 MB |
| [Mobile previews](mobile/) | 900 × 1600 px | 9:16 | PNG | Each file under 5 MB |

There are five images in each set, ordered for upload by filename.

## Desktop

1. [Habit Board and Today](desktop/01-habit-board-and-today.png) — the colorful streak grid beside the Today checklist.
2. [Weekday and weekly patterns](desktop/02-weekday-and-weekly-patterns.png) — two independent views in a review note.
3. [Calendar Overview](desktop/03-calendar-overview.png) — daily completion and month boundaries.
4. [Create a routine](desktop/04-create-a-routine.png) — a task scheduled for Monday, Wednesday, and Friday.
5. [Check-ins and freezes](desktop/05-check-ins-and-freezes.png) — correction controls and the shared freeze allowance.

## Mobile previews

1. [Today](mobile/01-today.png) — remaining and completed tasks grouped by routine.
2. [Habit Board and stats](mobile/02-habit-board-and-stats.png) — a selected routine’s lifetime stats below the date cells.
3. [Weekday Patterns](mobile/03-weekday-patterns.png) — weekday completion across routines.
4. [Calendar Overview](mobile/04-calendar-overview.png) — the green daily overview in a narrow pane.
5. [Create a routine](mobile/05-create-a-routine.png) — a daily task and accessible save controls.

The mobile set is **desktop-emulated responsive UI**, not physical iPhone screenshots. The 360 × 640 CSS-pixel content is rendered at 2.5× density to create exact 900 × 1600 images without stretching. Desktop workspace chrome is excluded from portrait crops; the editor preview omits background chrome. The plugin’s controls and displayed values are unchanged.

Other images elsewhere in `docs/images` include component crops and verification captures. Use these gallery folders for the recommended upload dimensions.

## Refresh and validate

With the isolated `/private/tmp/daymark-runtime-vault` instance running on debugging port 9231:

```sh
npm run screenshots:capture
npm run screenshots:check
npm run screenshots:package
```

The capture script uses temporary notes and demo data and restores saved records afterwards. A reusable empty `Daymark gallery` folder may remain in the isolated vault. The size validator checks PNG headers, exact dimensions, five images per set, and a strict 5,000,000-byte limit. The package command creates a ZIP containing both sets and this guide in `dist/`.
