# iPhone companion prototype

The plugin exports `habit-widget.json` into your vault. This Scriptable widget only reads that snapshot; it cannot change check-ins. It always labels the snapshot date and warns when the data is from an earlier date or more than two hours old.

1. Install Scriptable on the iPhone and create a script named **Daymark** with the contents of `Scriptable.js`.
2. Export the widget snapshot from Daymark in Obsidian.
3. In Scriptable settings, create a **File Bookmark** named **Daymark** for the exported JSON in your vault. The optional widget parameter can select another bookmark name. A bookmark provides access without hardcoding another app's private path.
4. Alternatively, copy the snapshot to **iCloud Drive / Scriptable / habit-widget.json**. This fallback is a manual copy and does not update when the original vault file changes.
5. Run the script once in Scriptable, then add a medium Scriptable Home Screen widget and choose the Daymark script. Tapping it opens Obsidian.

The snapshot must contain `date` (`YYYY-MM-DD`), `updatedAt` (ISO timestamp), and `remaining` / `completed` arrays with task `name` strings. A new date requires a new export from Obsidian. The widget requests refresh after 15 minutes; iOS determines the actual refresh time. A previously rendered widget may remain onscreen after midnight, so the visible snapshot date is always included.

Before relying on the companion, test these on the actual iPhone:

- Check a task, export, and run Scriptable; the counts and task names should change.
- Close Obsidian fully, then run the script and verify its bookmark still reads the export.
- Leave the previous day's export in place and run after midnight; the widget should ask to refresh and show the original date.
- Temporarily move or corrupt the JSON; the widget should show connection instructions.
- Compare small, medium, and large layouts, including long task names.

This environment has not verified iOS bookmark persistence or Home Screen refresh behavior. Device testing remains required.

For a fixed reminder, create a personal automation in Apple Shortcuts: **Time of Day → Daily → Show Notification** (“Open Daymark and check today's habits”). Optionally add **Open App → Obsidian**. This reminder does not inspect task completion, and notification behavior depends on the automation settings and iOS version.

References: [Scriptable FileManager](https://docs.scriptable.app/filemanager/), [Scriptable ListWidget](https://docs.scriptable.app/listwidget/), [Apple automation triggers](https://support.apple.com/guide/shortcuts/event-triggers-apd932ff833f/ios).
