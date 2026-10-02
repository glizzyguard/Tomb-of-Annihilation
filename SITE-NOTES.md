# Site notes: Architects of Balance wiki

How the Quartz build is put together, what each local piece does, and what is still open. Updated 2026-09-30 after the Quartz Build Brief v4.1 pass.

## Publishing path

- Notes live in the Obsidian vault (`C:\Users\patri\ToA`, folder `Tomb of Annihilation`). Quartz Syncer (Obsidian plugin, 2.1.0) pushes notes with `publish: true` straight to GitHub through the API; there is no local copy step. `deploy.yml` builds and publishes to GitHub Pages on every push to `main`.
- Syncer must have "Include all frontmatter" switched on. With it off, Syncer rewrites the frontmatter down to publish, title, description, draft, tags and timestamps, and every infobox key (type, race, class, status, first_seen, portrait...) is dropped. Fang in this repo was committed by hand, so Syncer has not published for real yet.
- Syncer does not strip `%% %%` comments, DM section headings, ledger asides or Dataview blocks from the raw Markdown; it only compiles Dataview when that integration is on. The toa-wiki plugin removes those from the built site, but the raw note is readable in this public repository. The vault-side check is `_Tools/wiki-pass/review-check.js`; Patrick accepted this on 2026-09-30 and the brief's 0.1 is dropped.
- Publish gate: every publishing note is `draft: true` until its row in the vault's Wiki Review Checklist says done. `remove-draft` is on, `explicit-publish` is on.

## Plugins and settings that differ from the ttrpg template

- `encrypted-pages` off (public repo; a `password:` field and the plaintext would both be readable).
- `crawl-links` `disableBrokenWikilinks: true`: links to unpublished pages carry the `broken` class and render dimmed. They stay clickable.
- `created-modified-date` `defaultDateType: published`. A page shows the date from its `date:` (alias of published) frontmatter. toa-wiki deletes the date data when the field is missing or empty, because the plugin would otherwise show the build time.
- `footer` off; `./plugins/toa-footer` renders the Fan Content Policy notice on every page and an optional `links` map (empty until Patrick decides; a Discord invite on a public site lets anyone join).
- `quartz-fonts`: header Cinzel, body EB Garamond, `fontOrigin: googleFonts`. This plugin, not `theme.typography`, decides the fonts; `theme.typography` is set to match for the generated link-preview images. ITS theme fonts are overridden by these options.
- `stacked-pages` on, on trial. Patrick judges it against the ITS layout and the right-floating infobox.
- `recent-notes` on: right sidebar, five entries, folder and tag pages hidden. Its options offer no folder filter, so it lists every page type; limiting it to session logs would need a TypeScript `filter` override.
- `obsidian-plugin-excalidraw` on and installed from npm (`@quartz-community/obsidian-plugin-excalidraw@1.0.0`), options as its README suggests. The vault has no drawings yet. Syncer's Excalidraw integration must be switched on in Obsidian for a drawing to publish.
- `@quartz-themes/core` `its-theme`, variation `ttrpg-dnd`. The variations `ttrpg-wotc`, `drowned` and `tangerine-dunes` all build clean; sample builds sit in `public-theme-<name>/` (ignored by git) for Patrick to compare. Each variation is a different ~740 KB theme stylesheet.
- `custom.scss`: hides the empty `### References` heading (footnote definitions move to Quartz's own section); adds `[!handout]` (parchment) and `[!secret]` (dark red) callouts with dark-mode colours. Both are readable in the public source.

## toa-wiki (local plugin, `plugins/toa-wiki`)

Transformer, order 25. Options in `quartz.config.yaml`.

- `companionRemap`: links to a withheld note that has a " (Wiki)" companion are rewritten to the companion.
- `dropSections`: Encounter Prep, Open Questions, To-Do headings go with their bodies. `dropCodeLangs`: dataview and dataviewjs blocks go.
- `ledgerAsides: callout`: `*(DM ledger: ...)*` paragraphs become a `[!info] Behind the screen` callout.
- `infobox`: frontmatter renders as a right-floating box per type (character, location, item, deity, organization, session). Keys per type are listed at the top of `index.js`.
- `portraits`: `portrait: "[[Name - portrait.webp]]"` shows at the top of the infobox; `gallery: ["[[...]]"]` adds thumbnails that swap into the main slot; clicking the main image opens a full-screen viewer (Esc or click closes). Images are looked up by file name anywhere under `content/`. The portrait also becomes the page's `socialImage` as a full URL, which is what the og-image plugin expects. Images over 500 KB or not WebP/JPEG are reported at build time; nothing is resized automatically.
- `dateFromFrontmatterOnly`: see dates above.
- `dropLeadingH1`: the templates open with `# Name`; Quartz renders the title itself.

## Folder names

Each content folder has a prose-free `index.md` (`type: hub`, `publish: true`, `title:`). Quartz uses that title for the folder page, the explorer and the breadcrumbs, so `01_The Party` reads as The Party. Web addresses keep the numbered slug. The vault's `apply.js` treats any note named `index` as a hub.

## Frontmatter fields the templates carry for the build

- `description`: one hand-written line for link previews and search results (the Description plugin otherwise starts the preview with infobox text).
- `date`: YYYY-MM-DD, shown as the page date; leave the key out to show none.
- `portrait`, `gallery` (Character template): see toa-wiki above. Captions and credits go in the optional `## Gallery` body section.
- `marker` (Location template): Leaflet Bases pins, nested YAML `[{coordinates: "lat, lng", mapName: chult}]`. Obsidian's properties editor cannot edit nested YAML; the Leaflet Bases click-to-place tool can.
- Session logs already carry `session_num`, `date`, `game_date`, `day_count`, `location`, `present`, which covers the timeline data the brief's Phase 4 asks for.

## Not done, and why

- Bases views (brief 2.2). `.base` pages get a synthetic frontmatter of `{title, tags}` with no `publish` key, so `explicit-publish` drops every one of them. Needs a small local filter that publishes `.base` files alongside `publish: true` notes, and Syncer's Bases integration on. Rows in a base only ever come from the published content index, so unpublished notes cannot appear. The image property for cards and gallery views is the view's `image` key (`image: note.portrait`).
- Favicon (2.3): Patrick supplies original art at `quartz/static/icon.png`.
- Timeline and atlas (Phase 4): not started. bases-page exposes a `viewRegistry` for custom views; a view receives `entries`, `view`, `basesData`, `allSlugs` and `linkResolution`, which is enough to read other notes' frontmatter. Research report still to write.
- Theme choice, footer links, stacked pages: Patrick's calls after looking.

## Known quirks

- Infobox image `src` attributes come out as `.././folder/file.webp` after crawl-links rebases them. Valid, cosmetic.
- The folder `01_The Party` and the hub note `The Party` share a display name.
- The vault's Character Cheat Sheet is `publish: false` in the file but `true` in the veto table; `apply.js --write` flips it every run until the two agree.

## toa-atlas (local plugin, `plugins/toa-atlas`), added 2026-09-30

A bases view, `type: toa-atlas`, registered the same way the Leaflet Bases plugin registers its map view. The vault note `Atlas.md` carries the base block (filter: `note.type` is session or location). The view gets every published session and location; sessions sort by `day_count` then `session_num` and show the in-world date, `description`, and links for each name in `locations` (wikilinks resolved against the published location notes; unresolved names render as plain text). Unpublished notes never appear because rows come from the published content index.

Stage 2 (2026-10-01): the view takes `image` (path under `content/`), optional `mapName` and `height`. With `image` set it draws the map above the timeline: Leaflet 1.9.4 and its stylesheet from jsDelivr (unpkg fallback), CRS.Simple, bounds from the image's pixel size, opening zoomed to fill the frame. A location note's first `marker` entry that belongs on this map (no `mapName`, or the view's) becomes a pin linking to the note; the route is a dotted line through each session's marked stops in timeline order, consecutive repeats collapsed. Stops without a marker are skipped by the route. Without the script the pins are a plain list of links. The map is `content/z_images/Foundry/scenes/chult/chult-labeled.webp` (6110 x 8192), committed by hand: nothing embeds it, so Syncer does not carry it, and the vault copy is ignored by the vault's git. Verified on a local build with staged sessions and markers.

Stages: 1 timeline (done). 2 map image, markers from `marker` frontmatter using the Leaflet Bases conventions (CRS.Simple, pixel coordinates from the bottom-left, `mapName`), route polyline through consecutive stops (done). 3 two-way highlighting between entries and markers. 4 full-screen home page via `cssclasses: [atlas]` on `index.md` and `.page:has(article.atlas)` CSS. Research and the per-session locations proposal: vault `DM Notes/Wiki_Atlas_Research.md`.

Hubs as places (2026-10-01): the base filter also takes `note.type == "hub"`, and the view treats a hub like a location for stops and markers, because Port Nyanzaru and its wards are hub notes (`00_Port Nyaznaru_Map`, `00_Harbor_Ward`). A location wins any name it shares with a hub; a hub pin shows its first alias. The 64 session logs with stops now carry `locations` (sessions 64 to 90 have none: the party was inside the Tomb).
