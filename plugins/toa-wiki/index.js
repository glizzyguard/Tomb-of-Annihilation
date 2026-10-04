// toa-wiki: Quartz 5 transformer for the Architects of Balance player wiki (the Tomb of Annihilation campaign).
// Four jobs, all switchable from quartz.config.yaml:
//   1. companionRemap  - [[Withheld Note]] links become links to its " (Wiki)" companion
//   2. dropSections    - session-log headings such as Encounter Prep / Open Questions go, with their bodies
//   3. ledgerAsides    - *(DM ledger: ...)* asides become a [!info] Behind the screen callout, or are stripped
//   4. infobox         - frontmatter renders as a right-floating infobox at the top of the article, per note type
//   5. dateFromFrontmatterOnly - pages with no date/published field show no date (the date plugin would otherwise show the build time)
//   6. portraits        - `portrait` and `gallery` frontmatter (wikilinks to image files in the content folder) render at the top of the
//                        infobox with a click-to-swap gallery and a full-screen viewer; the portrait also becomes the page's socialImage
import fs from "node:fs"
import path from "node:path"
import { parse as parseYaml } from "yaml"

const TYPE_MAP = {
  pc: "character",
  npc: "character",
  location: "location",
  item: "item",
  deity: "deity",
  faction: "organization",
  organization: "organization",
  session: "session",
}

const KEYS = {
  character: ["pronounced", "aliases", "titles", "race", "gender", "age", "class", "alignment", "player", "home", "location", "faction", "family", "patron", "status", "standing", "first_seen", "last_seen"],
  location: ["pronounced", "aliases", "category", "region", "ruler", "population", "inhabitants", "status", "first_visited", "last_visited"],
  item: ["pronounced", "aliases", "category", "rarity", "attunement", "creator", "owner", "former_owners", "status", "found"],
  deity: ["pronounced", "aliases", "titles", "pantheon", "alignment", "domains", "symbol", "worshipers", "vessel", "host", "status", "first_seen", "last_seen"],
  organization: ["pronounced", "aliases", "category", "leader", "headquarters", "members", "allies", "enemies", "status", "standing", "first_seen", "last_seen"],
  session: ["session_num", "date", "game_date", "day_count", "time_in_tomb", "location", "present"],
}

const LABELS = {
  pronounced: "Pronounced",
  aliases: "Also known as",
  first_seen: "First seen",
  last_seen: "Last seen",
  first_visited: "First visited",
  last_visited: "Last visited",
  former_owners: "Former owners",
  session_num: "Session",
  game_date: "Game date",
  day_count: "Day",
  time_in_tomb: "Time in the Tomb",
  standing: "Standing with the party",
  status: "Status",
}

const CSS = `
.toa-infobox { float: right; clear: right; width: 17rem; max-width: 46%; margin: 0 0 1rem 1.25rem; border: 1px solid var(--lightgray); background: var(--light); border-radius: 6px; font-size: 0.85rem; line-height: 1.35; }
.toa-infobox-title { font-family: var(--headerFont); font-weight: 700; font-size: 1rem; text-align: center; padding: 0.5rem 0.6rem; background: var(--lightgray); color: var(--dark); border-radius: 5px 5px 0 0; }
.toa-infobox-kind { display: block; font-weight: 400; font-size: 0.75rem; color: var(--darkgray); }
.toa-infobox table { width: 100%; border-collapse: collapse; margin: 0; font-size: inherit; }
.toa-infobox th { text-align: left; vertical-align: top; padding: 0.3rem 0.5rem; width: 38%; color: var(--darkgray); font-weight: 600; border-bottom: 1px solid var(--lightgray); border-top: 0; }
.toa-infobox td { padding: 0.3rem 0.5rem; border-bottom: 1px solid var(--lightgray); border-top: 0; vertical-align: top; }
.toa-infobox tr:last-child th, .toa-infobox tr:last-child td { border-bottom: 0; }
.toa-infobox-note { display: block; font-size: 0.85em; color: var(--gray); margin-top: 0.15rem; }
.toa-infobox-missing { color: var(--secondary); opacity: 0.5; }
@media (max-width: 800px) { .toa-infobox { float: none; width: 100%; max-width: 100%; margin: 0 0 1rem 0; } }
.toa-infobox-portrait { padding: 0.5rem 0.5rem 0; text-align: center; }
.toa-infobox-portrait img { max-width: 100%; height: auto; border-radius: 4px; cursor: zoom-in; display: inline-block; margin: 0; }
.toa-infobox-gallery { display: flex; flex-wrap: wrap; gap: 0.3rem; justify-content: center; padding: 0.4rem 0.5rem 0.5rem; }
.toa-infobox-gallery img { width: 3rem; height: 3rem; object-fit: cover; border-radius: 3px; cursor: pointer; margin: 0; border: 2px solid transparent; opacity: 0.85; }
.toa-infobox-gallery img:hover, .toa-infobox-gallery img.toa-current { border-color: var(--secondary); opacity: 1; }
#toa-lightbox { position: fixed; inset: 0; z-index: 9999; background: rgba(0, 0, 0, 0.9); display: none; align-items: center; justify-content: center; cursor: zoom-out; }
#toa-lightbox.toa-open { display: flex; }
#toa-lightbox img { max-width: 96vw; max-height: 96vh; object-fit: contain; margin: 0; border-radius: 4px; }
`

// The explorer reveals the current page's entry with scrollIntoView, which also scrolls the window when the
// page is the scroller (the plain Quartz layout). "nearest" keeps the reveal inside the explorer list.
const EXPLORER_SCROLL_JS = `
(() => {
  const orig = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = function (arg) {
    if (this.closest && this.closest(".explorer")) return orig.call(this, { block: "nearest", inline: "nearest" })
    return orig.call(this, arg)
  }
})()
`

const PORTRAIT_JS = `
(function () {
  if (window.__toaPortraits) return;
  window.__toaPortraits = true;
  function box() {
    var b = document.getElementById("toa-lightbox");
    if (b) return b;
    b = document.createElement("div");
    b.id = "toa-lightbox";
    var img = document.createElement("img");
    img.alt = "";
    b.appendChild(img);
    b.addEventListener("click", function () { b.classList.remove("toa-open"); });
    document.body.appendChild(b);
    return b;
  }
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!(t instanceof HTMLImageElement)) return;
    if (t.matches(".toa-infobox-gallery img")) {
      var main = t.closest(".toa-infobox").querySelector(".toa-infobox-portrait img");
      if (main) { main.src = t.getAttribute("data-full") || t.src; main.alt = t.alt; }
      t.parentElement.querySelectorAll("img").forEach(function (i) { i.classList.remove("toa-current"); });
      t.classList.add("toa-current");
      e.preventDefault();
    } else if (t.matches(".toa-infobox-portrait img")) {
      var b = box();
      b.querySelector("img").src = t.getAttribute("data-full") || t.src;
      b.querySelector("img").alt = t.alt;
      b.classList.add("toa-open");
      e.preventDefault();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { var b = document.getElementById("toa-lightbox"); if (b) b.classList.remove("toa-open"); }
  });
})();
`

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"])
const IMAGE_WARN_BYTES = 500 * 1024

const WIKILINK = /\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g

// ---------- vault index (names, aliases, companions), built once per content directory

const indexCache = new Map()

function readFrontmatter(text) {
  if (!text.startsWith("---")) return {}
  const end = text.indexOf("\n---", 3)
  if (end === -1) return {}
  try {
    return parseYaml(text.slice(3, end)) || {}
  } catch {
    return {}
  }
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith(".md")) out.push(full)
    else if (IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) out.push(full)
  }
}

function stripLink(value) {
  const m = /^\s*\[\[([^\]|#]+)/.exec(String(value))
  return (m ? m[1] : String(value)).trim()
}

// Quartz's slug rule for asset paths (see @quartz-community/utils slugifyPath): per segment, whitespace to "-",
// "&" to "-and-", "%" to "-percent", drop ?#<>:"|*, lowercase. The extension is kept for non-Markdown files.
function slugifyAssetPath(rel) {
  return rel
    .split("/")
    .map((seg) => seg.replace(/\s/g, "-").replace(/&/g, "-and-").replace(/%/g, "-percent").replace(/\?/g, "").replace(/#/g, "").replace(/[<>:"|*]/g, "").toLowerCase())
    .join("/")
}

// Relative URL from the current page slug to an asset slug, the way Quartz links between pages.
function relativeTo(pageSlug, assetSlug) {
  const depth = String(pageSlug || "").split("/").length - 1
  return (depth > 0 ? "../".repeat(depth) : "./") + assetSlug
}

// Accepts "[[Fang - portrait.webp]]", "[[Fang - portrait.webp|alt]]", "Fang - portrait.webp" or a folder path; returns
// { rel, slug, alt } or null when no such image is in the content folder.
function resolveImage(idx, raw) {
  if (raw === undefined || raw === null || raw === "") return null
  const s = String(raw).trim()
  const m = /^\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]$/.exec(s)
  const target = (m ? m[1] : s).trim().replace(/^!/, "")
  const base = path.posix.basename(target).toLowerCase()
  const rel = idx.images.get(base)
  if (!rel) return null
  return { rel, slug: slugifyAssetPath(rel), alt: (m && m[2] ? m[2] : path.posix.basename(target, path.posix.extname(target))).trim() }
}

function buildIndex(contentDir) {
  if (indexCache.has(contentDir)) return indexCache.get(contentDir)
  const idx = { names: new Set(), aliases: new Map(), companions: new Map(), images: new Map() }
  const files = []
  if (fs.existsSync(contentDir)) walk(contentDir, files)
  for (const file of files) {
    const ext = path.extname(file).toLowerCase()
    if (IMAGE_EXT.has(ext)) {
      const rel = path.relative(contentDir, file).split(path.sep).join("/")
      idx.images.set(path.basename(file).toLowerCase(), rel)
      try {
        const bytes = fs.statSync(file).size
        const fine = [".webp", ".jpg", ".jpeg"].includes(ext)
        if (bytes > IMAGE_WARN_BYTES || !fine)
          console.log("toa-wiki: image " + rel + " is " + Math.round(bytes / 1024) + " KB" + (fine ? "" : " and not WebP/JPEG") + "; Patrick resizes or converts, nothing is changed automatically")
      } catch {}
      continue
    }
    let text
    try {
      text = fs.readFileSync(file, "utf8").slice(0, 4000)
    } catch {
      continue
    }
    const fm = readFrontmatter(text)
    const name = path.basename(file, ".md")
    if (fm.companion_of) idx.companions.set(stripLink(fm.companion_of).toLowerCase(), name)
    if (fm.publish !== true) continue
    idx.names.add(name.toLowerCase())
    const aliases = Array.isArray(fm.aliases) ? fm.aliases : fm.aliases ? [fm.aliases] : []
    for (const a of aliases) if (a) idx.aliases.set(String(a).toLowerCase(), name)
  }
  indexCache.set(contentDir, idx)
  return idx
}

// Returns the note name a link target should point at, or null when nothing publishing matches.
function resolveTarget(idx, target) {
  const key = target.trim().replace(/\.md$/i, "").toLowerCase()
  if (idx.names.has(key)) return target.trim()
  const companion = idx.companions.get(key)
  if (companion && idx.names.has(companion.toLowerCase())) return companion
  const viaAlias = idx.aliases.get(key)
  if (viaAlias) return viaAlias
  return null
}

// ---------- mdast helpers

function toText(node) {
  if (!node) return ""
  if (node.type === "text" || node.type === "inlineCode") return node.value
  return (node.children || []).map(toText).join("")
}

function dropSections(tree, patterns) {
  const kids = tree.children
  for (let i = 0; i < kids.length; i++) {
    const node = kids[i]
    if (node.type !== "heading") continue
    const title = toText(node)
    if (!patterns.some((re) => re.test(title))) continue
    let j = i + 1
    while (j < kids.length && !(kids[j].type === "heading" && kids[j].depth <= node.depth)) j++
    kids.splice(i, j - i)
    i--
  }
}

// The wiki templates open the body with "# Name", and Quartz renders the title itself, so the first H1 goes.
function dropLeadingH1(tree) {
  for (let i = 0; i < tree.children.length; i++) {
    const n = tree.children[i]
    if (n.type === "yaml" || n.type === "toml") continue
    if (n.type === "heading" && n.depth === 1) tree.children.splice(i, 1)
    return
  }
}

function dropCodeBlocks(tree, langs) {
  tree.children = tree.children.filter((n) => !(n.type === "code" && n.lang && langs.includes(n.lang.toLowerCase())))
}

function asideOf(paragraph) {
  const first = paragraph.children && paragraph.children[0]
  if (!first || first.type !== "emphasis") return null
  const t = first.children && first.children[0]
  if (!t || t.type !== "text" || !/^\(DM ledger:/i.test(t.value)) return null
  return first
}

function calloutFrom(emphasis, title) {
  const inner = emphasis.children.map((c) => ({ ...c }))
  inner[0] = { ...inner[0], value: inner[0].value.replace(/^\(DM ledger:\s*/i, "") }
  const last = inner[inner.length - 1]
  if (last.type === "text" && /\)\s*$/.test(last.value)) inner[inner.length - 1] = { ...last, value: last.value.replace(/\)\s*$/, "") }
  return {
    type: "blockquote",
    children: [{ type: "paragraph", children: [{ type: "text", value: `[!info] ${title}\n` }, ...inner] }],
  }
}

// Rewrites ledger-aside paragraphs in place. A list item that is nothing but an aside is lifted out of
// its list so the callout stands on its own after the list; anything else is replaced where it sits.
function rewriteAsides(node, mode, title) {
  if (!node.children) return
  const next = []
  for (const child of node.children) {
    if (child.type === "paragraph" && asideOf(child)) {
      if (mode === "callout") next.push(calloutFrom(asideOf(child), title))
      continue
    }
    if (child.type === "list") {
      const items = []
      const lifted = []
      for (const item of child.children) {
        const only = item.children && item.children.length === 1 && item.children[0].type === "paragraph" && asideOf(item.children[0])
        if (only) {
          if (mode === "callout") lifted.push(calloutFrom(only, title))
          continue
        }
        rewriteAsides(item, mode, title)
        items.push(item)
      }
      child.children = items
      if (items.length) next.push(child)
      next.push(...lifted)
      continue
    }
    rewriteAsides(child, mode, title)
    next.push(child)
  }
  node.children = next
}

// ---------- infobox (hast)

function el(tagName, properties, children) {
  return { type: "element", tagName, properties: properties || {}, children: children || [] }
}
function text(value) {
  return { type: "text", value: String(value) }
}

function formatScalar(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v)
}

function inlineNodes(idx, raw) {
  const out = []
  const s = formatScalar(raw)
  let last = 0
  for (const m of s.matchAll(WIKILINK)) {
    if (m.index > last) out.push(text(s.slice(last, m.index)))
    const target = m[1].trim()
    const label = (m[3] || target).trim()
    const resolved = resolveTarget(idx, target)
    if (resolved) out.push(el("a", { href: resolved + (m[2] || "") }, [text(label)]))
    else out.push(el("span", { className: ["toa-infobox-missing"] }, [text(label)]))
    last = m.index + m[0].length
  }
  if (last < s.length) out.push(text(s.slice(last)))
  return out
}

function cellNodes(idx, value) {
  if (Array.isArray(value)) {
    const nodes = []
    value.forEach((v, i) => {
      if (i) nodes.push(el("br"))
      nodes.push(...inlineNodes(idx, v))
    })
    return nodes
  }
  return inlineNodes(idx, value)
}

function labelFor(key, labels) {
  if (labels[key]) return labels[key]
  const s = key.replace(/_/g, " ")
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function buildInfobox(idx, fm, fileName, opts, pageSlug) {
  const kind = TYPE_MAP[String(fm.type || "").toLowerCase()]
  if (!kind) return null
  const portrait = opts.portraits ? resolveImage(idx, fm.portrait) : null
  const gallery = opts.portraits && Array.isArray(fm.gallery) ? fm.gallery.map((g) => resolveImage(idx, g)).filter(Boolean) : []
  const media = []
  if (portrait) {
    const src = relativeTo(pageSlug, portrait.slug)
    media.push(el("div", { className: ["toa-infobox-portrait"] }, [el("img", { src, alt: portrait.alt, "data-full": src, loading: "lazy" })]))
    if (gallery.length) {
      const thumbs = [portrait, ...gallery.filter((g) => g.rel !== portrait.rel)]
      media.push(
        el(
          "div",
          { className: ["toa-infobox-gallery"] },
          thumbs.map((g, i) => {
            const s = relativeTo(pageSlug, g.slug)
            return el("img", { src: s, alt: g.alt, "data-full": s, loading: "lazy", className: i === 0 ? ["toa-current"] : [] })
          }),
        ),
      )
    }
  }
  const keys = (opts.keys && opts.keys[kind]) || KEYS[kind]
  const labels = { ...LABELS, ...(opts.labels || {}) }
  const rows = []
  for (const key of keys) {
    const value = fm[key]
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) continue
    const cell = el("td", {}, cellNodes(idx, value))
    if (key === "status" && fm.status_note) cell.children.push(el("span", { className: ["toa-infobox-note"] }, inlineNodes(idx, fm.status_note)))
    rows.push(el("tr", {}, [el("th", {}, [text(labelFor(key, labels))]), cell]))
  }
  if (!rows.length && !media.length) return null
  const title = fm.title ? String(fm.title) : fileName
  const kindLabel = kind === "session" ? "Session log" : kind.charAt(0).toUpperCase() + kind.slice(1)
  return el("aside", { className: ["toa-infobox", `toa-infobox-${kind}`] }, [
    el("div", { className: ["toa-infobox-title"] }, [text(title), el("span", { className: ["toa-infobox-kind"] }, [text(kindLabel)])]),
    ...media,
    ...(rows.length ? [el("table", {}, [el("tbody", {}, rows)])] : []),
  ])
}

// ---------- the plugin

export default function ToaWiki(userOpts) {
  const opts = {
    infobox: true,
    dropSections: ["Encounter Prep", "Open Questions", "To-Do"],
    dropCodeLangs: ["dataview", "dataviewjs"],
    ledgerAsides: "callout",
    calloutTitle: "Behind the screen",
    companionRemap: true,
    dropLeadingH1: true,
    dateFromFrontmatterOnly: true,
    portraits: true,
    ...(userOpts || {}),
  }
  const sectionPatterns = (opts.dropSections || []).map((s) => new RegExp(s, "i"))
  const contentDirOf = (ctx) => path.resolve(ctx.argv.directory)

  return {
    name: "ToaWiki",
    textTransform(ctx, src) {
      if (!opts.companionRemap) return src
      const idx = buildIndex(contentDirOf(ctx))
      if (!idx.companions.size) return src
      let head = ""
      let body = src
      if (src.startsWith("---")) {
        const end = src.indexOf("\n---", 3)
        if (end !== -1) {
          head = src.slice(0, end + 4)
          body = src.slice(end + 4)
        }
      }
      body = body.replace(WIKILINK, (whole, target, anchor, alias) => {
        const companion = idx.companions.get(target.trim().toLowerCase())
        if (!companion || companion.toLowerCase() === target.trim().toLowerCase()) return whole
        return `[[${companion}${anchor || ""}|${alias !== undefined ? alias : target.trim()}]]`
      })
      return head + body
    },
    markdownPlugins() {
      return [
        () => (tree) => {
          if (opts.dropLeadingH1) dropLeadingH1(tree)
          if (sectionPatterns.length) dropSections(tree, sectionPatterns)
          if (opts.dropCodeLangs && opts.dropCodeLangs.length) dropCodeBlocks(tree, opts.dropCodeLangs.map((l) => l.toLowerCase()))
          if (opts.ledgerAsides === "callout" || opts.ledgerAsides === "strip") rewriteAsides(tree, opts.ledgerAsides, opts.calloutTitle)
        },
      ]
    },
    htmlPlugins(ctx) {
      return [
        () => (tree, file) => {
          const fm = file.data.frontmatter || {}
          // created-modified-date coerces a missing date to `new Date()`, so an undated page would show the build time.
          if (opts.dateFromFrontmatterOnly && !fm.published && !fm.publishDate && !fm.date) delete file.data.dates
          const idx = buildIndex(contentDirOf(ctx))
          // Link previews: og-image wants a static path or a full URL, not a wikilink, so the portrait becomes one.
          if (opts.portraits && !fm.socialImage && !fm.image && !fm.cover) {
            const portrait = resolveImage(idx, fm.portrait)
            const baseUrl = ctx.cfg && ctx.cfg.configuration ? ctx.cfg.configuration.baseUrl : ""
            if (portrait && baseUrl) fm.socialImage = "https://" + String(baseUrl).replace(/\/$/, "") + "/" + portrait.slug
          }
          if (!opts.infobox) return
          const fileName = file.data.filePath ? path.basename(String(file.data.filePath), ".md") : ""
          const box = buildInfobox(idx, fm, fileName, opts, file.data.slug)
          if (box) tree.children.unshift(box)
        },
      ]
    },
    externalResources() {
      const res = { css: [{ content: CSS, inline: true }] }
      res.js = [{ script: EXPLORER_SCROLL_JS, loadTime: "beforeDOMReady", contentType: "inline", spaPreserve: true }]
      if (opts.portraits) res.js.push({ script: PORTRAIT_JS, loadTime: "afterDOMReady", contentType: "inline", spaPreserve: true })
      return res
    },
  }
}
