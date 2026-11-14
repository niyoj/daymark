# Daymark Today for Scriptable

[Daymark-Today.js](Daymark-Today.js) is the supplied Home Screen companion script. It reads `habit-widget.json` and displays today's completed count, a progress ring, and remaining tasks in a dark green layout. It never changes check-ins.

Follow the [iPhone setup steps in the main README](../README.md#set-up-the-scriptable-widget-on-iphone) to enable export, copy the script, create its bookmark, and add the widget.

## Connection settings

The defaults at the top of the script are:

```js
const bookmarkName = "Daymark Widget";
const exportFile = "habit-widget.json";
const previewSize = "large";
```

In **Scriptable → Settings → File Bookmarks**, create **Daymark Widget** for either the JSON file or its containing folder. A folder bookmark looks for `habit-widget.json` directly inside that folder. The widget parameter is not used by this script; change `bookmarkName` in the code if you choose another name.

The file must be accessible to Scriptable through the iPhone's Files picker. Exporting on a desktop does not by itself give the iPhone access: synchronize the file or copy it to an accessible folder. A manual copy does not follow later changes to the original export.

## Layout and refresh

- The large iPhone layout shows up to four remaining tasks; the large iPad layout shows up to five. Other tasks appear as a `+N more` count. Small and medium layouts show up to two tasks.
- `previewSize` controls the in-app preview. The Home Screen widget uses its actual selected size.
- The supplied script can show optional `projectedStreak` values under **If done**. Daymark's current version 1 export does not include that field, so large rows show **—** and compact rows omit the streak. The README mockup's streak numbers are illustrative.
- A different snapshot date shows **Out of date** instead of presenting old task counts as today's progress. This script does not warn about the age of a same-day export.
- Refresh is requested after 15 minutes or at the next local midnight, whichever comes first. iOS decides when the widget actually runs. Obsidian must run to generate a newer export.

## Troubleshooting

| Message | What to check |
| --- | --- |
| **Connect Daymark** | Create the bookmark with the exact name **Daymark Widget**. |
| **Export missing** | Run the export command and check the selected file or folder. |
| **Export unavailable** | Regenerate the JSON in Obsidian; the script expects schema version 1 with `date`, `remaining`, and `completed`. |
| **Can't read export** | Reconnect the bookmark and make sure the file is available locally or downloaded from iCloud. |
| **Out of date** | Open Obsidian, refresh the export, and wait for the current file to reach the iPhone. |

After setup, check a task in Obsidian and run Scriptable again to verify the counts change. Also test bookmark access after closing Obsidian, after midnight, and with long task names on the actual Home Screen. Automated tests check script behavior with a host adapter; physical iPhone bookmark persistence, rendering, and background refresh remain unverified here.

## Earlier compact companion

[Scriptable.js](Scriptable.js) remains available for existing installations. It uses a bookmark named **Daymark** (or the widget parameter), falls back to `iCloud Drive / Scriptable / habit-widget.json`, previews at medium size, and warns about exports older than two hours. Its setup differs from **Daymark Today**; use the new script for the README's widget layout.

References: [Scriptable file bookmarks](https://docs.scriptable.app/filemanager/#-bookmarkedpath), [widget refresh](https://docs.scriptable.app/listwidget/#refreshafterdate), [Apple's Home Screen widget guide](https://support.apple.com/118610).
