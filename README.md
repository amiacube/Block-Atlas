# Block Atlas

A React 19 + TypeScript atlas of all **1,286 registered Minecraft Java Edition 26.3 block IDs**, compared with Bloxd.io’s default assets. The controls use components from the [official LiquiKit registry](https://liquikit.dev/docs).

## Open or deploy

**Ready-to-serve build:** the download includes `site/`. Serve that directory with any static HTTP server and open its address in a browser. For example:

```sh
python -m http.server 8000 --directory site
```

Open `http://localhost:8000/`. Don’t open `index.html` with `file://`: the app fetches the CSV over HTTP. The default build needs no external API, and includes the texture previews. The font fallback is bundled too: the app prefers the Apple system font where available and otherwise uses self-hosted Inter.

**Develop** (Node 20.19+ or 22.12+):

```sh
npm ci
npm run dev
```

Open `http://localhost:5173/`. `npm run build` writes a production build to `dist/`. Deploy the files in `dist/` or the supplied `site/` together, including `data/`, `exports/`, and `llms.txt`.

## CSV URL

The app fetches `./data/minecraft-26.3-bloxd.csv` from the same host by default. The table is not compiled into the JavaScript bundle.

- Open **CSV source** (the database icon on compact screens), enter a direct public HTTPS URL, then click **Load CSV**. **Use bundled CSV** returns to the provided dataset.
- Link to the app with `?csv=` followed by a URL-encoded direct CSV URL, or set `VITE_CSV_URL` in `.env.local` before running Vite or building. A query parameter takes precedence over a saved browser choice, which takes precedence over the environment default.
- External hosts must allow browser requests from the atlas origin (for public files, `Access-Control-Allow-Origin: *` works). There is no server-side proxy. On a failed change, the app explains the error and keeps the last successful dataset.
- A custom file must provide one unique ID per row under **`Minecraft block ID`** (or `Block ID` / `minecraft_id`). The original `minecraft-to-bloxd-colors.csv` schema and the new complete CSV both work. Quoted values, UTF-8 BOM, and embedded newline fields are supported. Suggestions, ΔE00, surface colors, metadata, and limitations are optional. Custom sources use their own values; the bundled texture artwork is not shown for a custom file. A partial file is labeled as such.

Minimal example:

```csv
Minecraft block ID,Minecraft block,Bloxd block,Replacement tier,Real limitations
minecraft:stone,Stone,Stone,Direct counterpart,Confirm behavior in your Bloxd mode.
```

## Download formats

Use the **Download** arrow in the top toolbar. The files contain every block in the active dataset, not just the current search or filter results.

- **Spreadsheet CSV** — a UTF-8 table with sorting-friendly headings, exact Minecraft IDs and Bloxd states, scores, hex colors, and limitations. The simplified CSV can be loaded into the atlas again.
- **Printable PDF** — an A4, searchable comparison catalog with page numbers, linked categories, suggestions, tiers, scores, and swatches. CSV and plain text include the longer limitations. The PDF uses standard Latin fonts; unsupported characters in some custom CSVs are shown as code points. UTF-8 text is still available in the other exports.
- **Plain text** — all entries grouped by category, with IDs, swatches, and notes.
- **llms.txt** — a short schema and interpretation guide, with relative links to the accompanying downloads. It does not include a custom source URL.
- **Original CSV** — the full source file byte-for-byte, preserving line endings, BOM, and every original column.

Bundled exports are normal file links (`exports/` and `llms.txt`) and are included in the static build. Custom CSV exports are generated locally in your browser. If an embedded preview cannot save files, open the live app in its own browser tab. `npm run export:bundled` refreshes the bundled exports after an update to the reference data; `npm run build` runs this automatically.

## Workspace and accessibility

The top toolbar keeps search, download, and source settings together. Use the collection switcher to browse all blocks, world-generation blocks, later examples, or other IDs. **All categories** narrows the collection; **View** holds match type, sorting, and **Reset view**. On wide screens the comparison has its own scrolling pane; on compact screens it opens as a full-width view and Back restores the list position and focus. The list mounts only the nearby rows, with all IDs still reachable by search and scrolling.

The layout takes cues from Apple’s [Typography](https://developer.apple.com/design/human-interface-guidelines/typography), [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars), and [Scroll Views](https://developer.apple.com/design/human-interface-guidelines/scroll-views) guidance. It is a web app, not a native macOS or iOS app. The type stack prefers San Francisco on Apple devices and uses bundled Inter elsewhere. The UI follows the system light/dark and reduced-motion settings. Glass is reserved for controls; the table and measurements use standard content surfaces.

The search field, toolbar, collection switcher, select, menu, dialogs, form, comparison tabs, and accordions are actual components from the [official LiquiKit registry](https://liquikit.dev/docs). The list, comparison, menus and settings use LiquiKit [Scroll Area](https://liquikit.dev/docs/components/scroll-area) viewports and overlay thumbs. The local Scroll Area wrapper forwards viewport props and refs for focus integration; it does not change the scrollbar. A small opt-in in `popup.tsx` lets the atlas fade the real glass pane and its content together instead of launching the stock travelling morph. There is no outer popup fill or full-screen blur. Only modal dialogs retain a dimming scrim, timed with the pane. Outside this opt-in the stock morph remains available.

Use `⌘K` / `Ctrl+K` or `/` to focus search. In the block list, use the arrow keys, Page Up/Down, or Home/End to move between rows, and Enter to inspect. Top and side textures use their own tabs. Escape closes menus and dialogs.

## Snapshot and measurements

- **598** world-generation IDs, **10** previously documented later-generation examples, and **678** other registered IDs. All 42 original columns and their values are preserved for the 608 earlier rows; the appended `Atlas category` column unifies the filter groups. The two item-frame blockstate files are entity render assets and excluded based on registry membership.
- **1,279** color-scored rows, **7** with no meaningful surface score. Air variants and technical blocks remain in the table; a blank is not a zero. The exact suggestions are names or states from the Bloxd registry snapshot. Some cannot be placed in every mode.
- Mean sRGB samples use representative top and side projections and texture alpha. Overall CIEDE2000 (ΔE00) weights shared coverage, or uses the comparable face group where only one exists. When different exposed surfaces are compared, the row says so. Biome tint, animation, geometry, and block-entity effects have the limitations noted per row. The available biome samples for water, grass block, and oak leaves are in their detail panels.
- Results use reviewed shortlists, not an exhaustive nearest-neighbor search across all Bloxd states. Functional limits are reported separately from color. `public/data/snapshot.json` identifies the pinned versions and reports audit notes.

Sources: [Minecraft Java 26.3 release notes](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-3), the pinned Mojang Java client asset JAR, [versioned Java registry](https://github.com/misode/mcmeta/tree/26.3-registries/block), [official Bloxd block names](https://github.com/Bloxdy/code-api/blob/cec73059b21be931d490778c2128b5ce309374b0/BLOCK_NAMES.txt), [Bloxd default texture pack](https://github.com/Bloxdy/texture-packs/tree/2e793bc63ebffe2333039516c9d9be55f504c20c/default), and [Bloxd client entry snapshot](https://github.com/imu31465/Bloxd-Entries-Data/tree/77393d1a1e30e2a1d35237fcd193ff3d573d096b). The reference game textures belong to their respective creators. LiquiKit's license is included with its source; third-party build notices accompany the download.

### Verify or rebuild the data

```sh
python scripts/check_data.py
# Optional rebuild, with Python 3.10+ and curl. Needs network access to pinned game assets:
python -m pip install -r scripts/requirements.txt
python scripts/build_data.py --sources /path/to/local/asset-cache
python scripts/check_data.py --registries /path/to/local/asset-cache/registry-block.json
```

The build script uses the earlier world-generation rows and swatches in `source-data/`. General runtime use does not need Python packages, the game client, or the external texture servers. The Playwright regression test is `scripts/test_browser.cjs` (start the app first and install Playwright + Chromium separately; set `ATLAS_WEBKIT=1` for an additional WebKit pass). It checks scrolling and thumb dragging, focus and responsive layout, CSV loading, all download formats and byte-for-byte original export, and popup opening frames in light and dark with normal motion.
