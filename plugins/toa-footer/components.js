import { h } from "preact"

// Required wording; the site name may be adjusted if the site title changes.
const NOTICE =
  "Tomb of the Nine Gods is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC."

const CSS = `
footer {
  text-align: left;
  margin-bottom: 4rem;
  opacity: 0.7;
}
footer .toa-footer-notice {
  font-size: 0.8rem;
  line-height: 1.4;
  margin: 0 0 0.5rem 0;
}
footer ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 1rem;
}
`

export const Footer = (opts) => {
  const links = (opts && opts.links) || {}
  const notice = (opts && opts.notice) || NOTICE
  const Component = ({ displayClass }) => {
    const entries = Object.entries(links)
    return h("footer", { class: displayClass || "" }, [
      h("p", { class: "toa-footer-notice" }, notice),
      entries.length
        ? h(
            "ul",
            {},
            entries.map(([text, href]) => h("li", {}, h("a", { href }, text))),
          )
        : null,
    ])
  }
  Component.css = CSS
  return Component
}
