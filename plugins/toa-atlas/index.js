// toa-atlas: a bases view for the Architects of Balance wiki. Put this block in a published note:
//
//   ```base
//   filters:
//     or:
//       - note.type == "session"
//       - note.type == "location"
//   views:
//     - type: toa-atlas
//       name: Atlas
//   ```
//
// The view receives every published note matching the filter. Sessions become the timeline, in expedition order
// (day_count, then session_num); each entry shows the in-world date, the hand-written description, and links to the
// places in its `locations` list. Location entries are only used to resolve those links (and, from stage 2, markers).
// Stage 1: timeline only. Stage 2 adds the map and route, stage 3 the two-way highlighting, stage 4 the home page.
import { h } from "preact"
import { viewRegistry, transformLink } from "@quartz-community/bases-page"

const CSS = `
.toa-atlas { margin: 1rem 0; }
.toa-atlas-timeline { list-style: none; margin: 0; padding: 0; border-left: 2px solid var(--lightgray); }
.toa-atlas-entry { position: relative; margin: 0; padding: 0.35rem 0 0.35rem 1.1rem; }
.toa-atlas-entry::before { content: ""; position: absolute; left: -0.42rem; top: 0.85rem; width: 0.7rem; height: 0.7rem; border-radius: 50%; background: var(--secondary); border: 2px solid var(--light); }
.toa-atlas-entry.toa-atlas-active::before { background: var(--tertiary); transform: scale(1.3); }
.toa-atlas-head { display: flex; flex-wrap: wrap; gap: 0.5rem 0.8rem; align-items: baseline; }
.toa-atlas-session { font-family: var(--headerFont); font-weight: 600; }
.toa-atlas-when { color: var(--darkgray); font-size: 0.9em; }
.toa-atlas-desc { margin: 0.15rem 0 0; }
.toa-atlas-stops { display: block; margin-top: 0.15rem; font-size: 0.9em; }
.toa-atlas-stops a + a::before { content: " › "; color: var(--gray); }
.toa-atlas-missing { color: var(--gray); }
.toa-atlas-empty { color: var(--darkgray); font-style: italic; }
`

const WIKILINK = /^\s*\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]\s*$/

function str(v) {
  return v === undefined || v === null ? "" : String(v)
}
function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
function listOf(v) {
  if (Array.isArray(v)) return v.map(str).filter(Boolean)
  const s = str(v).trim()
  return s ? [s] : []
}
// "[[Name|alias]]" -> { name, label }; plain strings pass through
function parseLink(raw) {
  const m = WIKILINK.exec(str(raw))
  if (!m) return { name: str(raw).trim(), label: str(raw).trim() }
  return { name: m[1].trim(), label: (m[2] || m[1]).trim() }
}

function buildLocationIndex(entries) {
  const byName = new Map()
  for (const e of entries) {
    if (str(e.properties && e.properties.type).toLowerCase() !== "location") continue
    const base = e.fileProperties && e.fileProperties.basename ? e.fileProperties.basename : e.title
    byName.set(str(base).toLowerCase(), e)
    if (e.title) byName.set(str(e.title).toLowerCase(), e)
    for (const a of listOf(e.properties.aliases)) byName.set(a.toLowerCase(), e)
  }
  return byName
}

function sessionSort(a, b) {
  const da = num(a.properties.day_count), db = num(b.properties.day_count)
  if (da !== undefined && db !== undefined && da !== db) return da - db
  if (da === undefined && db !== undefined) return 1
  if (da !== undefined && db === undefined) return -1
  const sa = num(a.properties.session_num) ?? 0, sb = num(b.properties.session_num) ?? 0
  return sa - sb
}

const render = ({ entries, slug, allSlugs, linkResolution }) => {
  const linkOpts = { strategy: linkResolution, allSlugs }
  const link = (target) => transformLink(slug, target, linkOpts)
  const locations = buildLocationIndex(entries)
  const sessions = entries
    .filter((e) => str(e.properties && e.properties.type).toLowerCase() === "session")
    .sort(sessionSort)

  if (!sessions.length) return h("div", { class: "toa-atlas" }, h("p", { class: "toa-atlas-empty" }, "No published sessions yet."))

  const items = sessions.map((s) => {
    const p = s.properties
    const n = num(p.session_num)
    const stops = listOf(p.locations).map(parseLink)
    const stopNodes = stops.map((st) => {
      const loc = locations.get(st.name.toLowerCase())
      return loc
        ? h("a", { href: link(loc.slug), class: "internal", "data-slug": loc.slug }, st.label)
        : h("span", { class: "toa-atlas-missing" }, st.label)
    })
    const when = [num(p.day_count) !== undefined ? "Day " + num(p.day_count) : "", str(p.game_date)].filter(Boolean).join(" · ")
    return h(
      "li",
      {
        class: "toa-atlas-entry",
        "data-session": n !== undefined ? String(n) : "",
        "data-stops": stops.map((st) => (locations.get(st.name.toLowerCase()) || {}).slug || "").filter(Boolean).join(","),
      },
      [
        h("div", { class: "toa-atlas-head" }, [
          h("a", { href: link(s.slug), class: "internal toa-atlas-session" }, n !== undefined ? "Session " + n : s.title),
          when ? h("span", { class: "toa-atlas-when" }, when) : null,
        ]),
        str(p.description) ? h("p", { class: "toa-atlas-desc" }, str(p.description)) : null,
        stopNodes.length ? h("span", { class: "toa-atlas-stops" }, stopNodes) : null,
      ],
    )
  })

  return h("div", { class: "toa-atlas" }, h("ol", { class: "toa-atlas-timeline" }, items))
}

export const toaAtlasViewRegistration = {
  id: "toa-atlas",
  name: "Atlas",
  icon: "map",
  render,
  css: CSS,
}

export function init(options) {
  viewRegistry.register({ ...toaAtlasViewRegistration, options: options || {} })
}

viewRegistry.register(toaAtlasViewRegistration)
