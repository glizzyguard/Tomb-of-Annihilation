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
//       image: z_images/Foundry/scenes/chult/chult-labeled.webp
//       mapName: chult
//   ```
//
// The view receives every published note matching the filter. Sessions become the timeline, in expedition order
// (day_count, then session_num); each entry shows the in-world date, the hand-written description, and links to the
// places in its `locations` list. Location notes carrying `marker` frontmatter (the Leaflet Bases convention:
// `coordinates: "lat, lng"` in image pixels from the bottom-left, optional `mapName`, `colour`) become map markers,
// and the route is the line through each session's marked stops in order. Without `image` the view is the timeline
// alone. `mapName` on the view keeps markers meant for another map off this one; `height` is the map height in px.
// Stage 1: timeline. Stage 2: map, markers, route. Stage 3 adds the two-way highlighting, stage 4 the home page.
import { h } from "preact"
import { viewRegistry, transformLink } from "@quartz-community/bases-page"

const CSS = `
.toa-atlas { margin: 1rem 0; }
.toa-atlas-map { width: 100%; height: min(720px, 80vh); margin: 0 0 1.2rem; border: 1px solid var(--lightgray); border-radius: 4px; background: var(--lightgray); overflow: hidden; }
.toa-atlas-map:not(.leaflet-container) { height: auto; padding: 0.6rem 0.8rem; background: none; }
.toa-atlas-map:not(.leaflet-container) .toa-atlas-marker { display: inline-block; margin-right: 0.8rem; }
.toa-atlas-map.leaflet-container img { margin: 0; border-radius: 0; max-width: none; }
.toa-atlas-map.leaflet-container a { background: none; }
.toa-atlas-pin { background: none; border: 0; }
.toa-atlas-pin a { display: block; width: 100%; height: 100%; }
.toa-atlas-pin svg { width: 100%; height: 100%; stroke: #1b1b1b; stroke-width: 1.5; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5)); }
.toa-atlas-timeline { list-style: none; margin: 0; padding: 0; border-left: 2px solid var(--lightgray); }
.toa-atlas-entry { position: relative; margin: 0; padding: 0.35rem 0 0.35rem 1.1rem; }
.toa-atlas-entry::before { content: ""; position: absolute; left: -0.42rem; top: 0.85rem; width: 0.7rem; height: 0.7rem; border-radius: 50%; background: var(--secondary); border: 2px solid var(--light); }
.toa-atlas-entry.toa-atlas-active::before { background: var(--tertiary); transform: scale(1.3); }
.toa-atlas-head { display: flex; flex-wrap: wrap; gap: 0.5rem 0.8rem; align-items: baseline; }
.toa-atlas-session { font-family: var(--headerFont); font-weight: 600; }
.toa-atlas-when { color: var(--darkgray); font-size: 0.9em; }
.toa-atlas-desc { margin: 0.15rem 0 0; }
.toa-atlas-stops { display: block; margin-top: 0.15rem; font-size: 0.9em; }
.toa-atlas-stops > * + *::before { content: " › "; color: var(--gray); }
.toa-atlas-missing { color: var(--gray); }
.toa-atlas-empty { color: var(--darkgray); font-style: italic; }
`

// Client side. Leaflet 1.9.4 from the CDN the Leaflet Bases plugin uses; CRS.Simple with the image's pixel size as
// bounds, so coordinates copied with the Obsidian Leaflet Bases tool land where they were clicked.
const SCRIPT = `
(function () {
  var JS = ["https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js", "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"]
  var CSS = ["https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css", "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"]
  var PIN = '<svg viewBox="0 0 32 48"><path d="m32,19c0,12 -12,24 -16,29c-4,-5 -16,-16 -16,-29a16,19 0 0 1 32,0"/><circle cx="16" cy="18" r="6" style="fill:#fff;stroke:none"/></svg>'

  function load(urls, make) {
    return urls.reduce(function (p, url) {
      return p.catch(function () {
        return new Promise(function (resolve, reject) {
          var el = make(url)
          el.onload = function () { resolve() }
          el.onerror = function () { el.remove(); reject(new Error("failed: " + url)) }
          document.head.appendChild(el)
        })
      })
    }, Promise.reject())
  }
  function loadLeaflet() {
    var css = document.querySelector("link[data-toa-leaflet]")
      ? Promise.resolve()
      : load(CSS, function (url) {
          var l = document.createElement("link")
          l.rel = "stylesheet"; l.href = url; l.setAttribute("data-toa-leaflet", "")
          return l
        })
    var js = typeof L !== "undefined"
      ? Promise.resolve()
      : load(JS, function (url) {
          var s = document.createElement("script")
          s.src = url
          return s
        })
    return Promise.all([css, js])
  }
  function coords(text) {
    var p = String(text || "").split(",").map(function (v) { return parseFloat(v) })
    return p.length === 2 && isFinite(p[0]) && isFinite(p[1]) ? p : null
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] })
  }
  function imageSize(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image()
      img.onload = function () { resolve([img.naturalHeight, img.naturalWidth]) }
      img.onerror = reject
      img.src = url
    })
  }

  function build(el) {
    var pins = Array.prototype.map.call(el.querySelectorAll("a.toa-atlas-marker"), function (a) {
      return { name: a.textContent, href: a.getAttribute("href"), slug: a.dataset.slug, at: coords(a.dataset.coordinates), colour: a.dataset.colour }
    }).filter(function (p) { return p.at })
    var route = []
    try { route = JSON.parse(el.dataset.route || "[]") } catch (e) {}

    return imageSize(el.dataset.src).then(function (size) {
      el.replaceChildren()
      var bounds = [[0, 0], size]
      var map = L.map(el, { crs: L.CRS.Simple, maxBounds: bounds, maxBoundsViscosity: 0.8, minZoom: -6, maxZoom: 1, zoomSnap: 0.25, zoomDelta: 0.5, attributionControl: false })
      L.imageOverlay(el.dataset.src, bounds).addTo(map)
      map.fitBounds(bounds)
      map.setMinZoom(map.getZoom())
      // open filling the frame (the Chult map is taller than it is wide); zooming out shows the whole sheet
      map.setView([size[0] / 2, size[1] / 2], map.getBoundsZoom(bounds, true), { animate: false })

      if (route.length > 1) {
        L.polyline(route, { color: "#7a1f1f", weight: 3, opacity: 0.85, dashArray: "2 7", lineCap: "round", interactive: false }).addTo(map)
      }
      var markers = {}
      pins.forEach(function (p) {
        var icon = L.divIcon({
          className: "toa-atlas-pin",
          html: '<a href="' + esc(p.href) + '" class="internal" style="fill:' + esc(p.colour) + '">' + PIN + "</a>",
          iconSize: [22, 33], iconAnchor: [11, 33], tooltipAnchor: [12, -22],
        })
        markers[p.slug] = L.marker(p.at, { icon: icon, title: p.name }).bindTooltip(p.name).addTo(map)
      })
      el.toaAtlas = { map: map, markers: markers }
      return map
    })
  }

  function init() {
    var maps = document.querySelectorAll("div.toa-atlas-map[data-src]")
    if (!maps.length) return
    loadLeaflet().then(function () {
      Array.prototype.forEach.call(maps, function (el) {
        if (el.classList.contains("leaflet-container")) return
        build(el).then(function (map) {
          if (window.addCleanup) window.addCleanup(function () { map.remove() })
        }).catch(function (err) { console.error("[toa-atlas] map failed:", err) })
      })
    }).catch(function (err) { console.error("[toa-atlas] Leaflet did not load:", err) })
  }
  document.addEventListener("nav", init)
})()
`

const WIKILINK = /^\s*\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]\s*$/
const COORDS = /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/
const DEFAULT_COLOUR = "#a02c2c"

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
function typeOf(e) {
  return str(e.properties && e.properties.type).toLowerCase()
}

function buildLocationIndex(entries) {
  const byName = new Map()
  for (const e of entries) {
    if (typeOf(e) !== "location") continue
    const base = e.fileProperties && e.fileProperties.basename ? e.fileProperties.basename : e.title
    byName.set(str(base).toLowerCase(), e)
    if (e.title) byName.set(str(e.title).toLowerCase(), e)
    for (const a of listOf(e.properties.aliases)) byName.set(a.toLowerCase(), e)
  }
  return byName
}

// slug -> { coordinates, colour }: the note's first marker that belongs on this map
function buildMarkerIndex(entries, mapName) {
  const bySlug = new Map()
  for (const e of entries) {
    if (typeOf(e) !== "location") continue
    const raw = e.properties.marker
    const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : []
    for (const m of list) {
      if (!m || typeof m !== "object" || !COORDS.test(str(m.coordinates))) continue
      const on = str(m.mapName).trim()
      if (mapName ? on && on !== mapName : on) continue
      bySlug.set(e.slug, { coordinates: str(m.coordinates).trim(), colour: str(m.colour).trim() || DEFAULT_COLOUR })
      break
    }
  }
  return bySlug
}

function sessionSort(a, b) {
  const da = num(a.properties.day_count), db = num(b.properties.day_count)
  if (da !== undefined && db !== undefined && da !== db) return da - db
  if (da === undefined && db !== undefined) return 1
  if (da !== undefined && db === undefined) return -1
  const sa = num(a.properties.session_num) ?? 0, sb = num(b.properties.session_num) ?? 0
  return sa - sb
}

const render = ({ entries, view, slug, allSlugs, linkResolution }) => {
  const linkOpts = { strategy: linkResolution, allSlugs }
  const link = (target) => transformLink(slug, target, linkOpts)
  const locations = buildLocationIndex(entries)
  const sessions = entries.filter((e) => typeOf(e) === "session").sort(sessionSort)

  const image = str(view && view.image).trim()
  const markers = image ? buildMarkerIndex(entries, str(view.mapName).trim()) : new Map()
  const route = []

  const items = sessions.map((s) => {
    const p = s.properties
    const n = num(p.session_num)
    const stops = listOf(p.locations).map(parseLink).map((st) => ({ ...st, loc: locations.get(st.name.toLowerCase()) }))
    for (const st of stops) {
      const m = st.loc && markers.get(st.loc.slug)
      if (!m) continue
      const at = m.coordinates.split(",").map(Number)
      const last = route[route.length - 1]
      if (!last || last[0] !== at[0] || last[1] !== at[1]) route.push(at)
    }
    const stopNodes = stops.map((st) =>
      st.loc
        ? h("a", { href: link(st.loc.slug), class: "internal", "data-slug": st.loc.slug }, st.label)
        : h("span", { class: "toa-atlas-missing" }, st.label),
    )
    const when = [num(p.day_count) !== undefined ? "Day " + num(p.day_count) : "", str(p.game_date)].filter(Boolean).join(" · ")
    return h(
      "li",
      {
        class: "toa-atlas-entry",
        "data-session": n !== undefined ? String(n) : "",
        "data-stops": stops.map((st) => (st.loc ? st.loc.slug : "")).filter(Boolean).join(","),
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

  // The marker links are the map's content until the script replaces them, so the places stay reachable without it.
  const map = image
    ? h(
        "div",
        {
          class: "toa-atlas-map",
          "data-src": link(image),
          "data-route": JSON.stringify(route),
          style: num(view.height) ? "height:" + num(view.height) + "px" : undefined,
        },
        entries
          .filter((e) => markers.has(e.slug))
          .map((e) =>
            h(
              "a",
              {
                href: link(e.slug),
                class: "internal toa-atlas-marker",
                "data-slug": e.slug,
                "data-coordinates": markers.get(e.slug).coordinates,
                "data-colour": markers.get(e.slug).colour,
              },
              e.title,
            ),
          ),
      )
    : null

  const timeline = sessions.length
    ? h("ol", { class: "toa-atlas-timeline" }, items)
    : h("p", { class: "toa-atlas-empty" }, "No published sessions yet.")

  return h("div", { class: "toa-atlas" }, [map, timeline])
}

export const toaAtlasViewRegistration = {
  id: "toa-atlas",
  name: "Atlas",
  icon: "map",
  render,
  css: CSS,
  afterDOMLoaded: SCRIPT,
}

export function init(options) {
  viewRegistry.register({ ...toaAtlasViewRegistration, options: options || {} })
}

viewRegistry.register(toaAtlasViewRegistration)
