# PDF flipbook for Webflow

A page-turning PDF viewer for a Webflow CMS collection, built on PDF.js and StPageFlip.
Each document gets its own clean page (`/pubblicazioni/<slug>`) that renders the PDF uploaded in the CMS.

**Try it locally:** put a PDF named `sample.pdf` next to `index.html`, then run
`python3 -m http.server 8765` and open <http://localhost:8765/> (or `?pdf=other.pdf&title=…`).

Contents: `flipbook.js` (viewer), `flipbook.css` (styles), `index.html` (demo page).

## 1. CMS collection

Collection **Pubblicazioni**, collection URL slug `pubblicazioni`.
Each item lives at `dominio.it/pubblicazioni/<slug>`.

| Field | Type | Notes |
|---|---|---|
| Name | Plain text | e.g. "Bilancio di Sostenibilità 2025" |
| Slug | (built-in) | keep it short: `bilancio-sostenibilita-2025` |
| PDF | File | the document |
| Copertina | Image | cover image (JPG, ~1200×630 crop or the first page) for link previews |
| Descrizione | Plain text | 1–2 sentences, used as meta description |
| Anno | Number or Date | optional, for sorting on listing pages |

## 2. Template page (Pubblicazioni Template)

- **SEO settings:** Title = `Name` + " | <brand>", Meta description = `Descrizione`.
- **Open Graph:** image = `Copertina`, title/description the same as above. A shared link (WhatsApp, LinkedIn, email) then shows a proper preview card.
- **Layout:** a slim header (logo → home, document title), then a **Code Embed** that fills the rest of the screen.
  Give the embed's wrapper div the class `publication-viewer` and set its height to `calc(100dvh - <header height>)`,
  or skip the header and leave the default (100dvh).

### Code Embed content

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/Pepperzero/pdf-flipbook@1.0.0/flipbook.min.css">
<div data-flipbook data-pdf="{{PDF}}" data-title="{{Name}}"
     style="--sfb-height: calc(100dvh - 64px)"></div>
<script type="module" src="https://cdn.jsdelivr.net/gh/Pepperzero/pdf-flipbook@1.0.0/flipbook.min.js"></script>
```

`{{PDF}}` / `{{Name}}` = use "+ Add field" in the embed editor to insert the CMS fields.

> **To check in Webflow:** if the embed's field picker doesn't offer the File field, leave `data-pdf=""`
> and add a normal Link Block (e.g. a "Scarica PDF" button) whose URL is bound to the PDF field, with the
> custom attribute `data-flipbook-pdf`. The viewer reads the URL from that link instead.

## 3. Hosting flipbook.js / flipbook.css

The files are served from this repo by jsDelivr (free CDN; jsDelivr generates the `.min` versions itself).
The URL is pinned to the git tag `v1.0.0`, so changes pushed here don't reach the live site until you tag
a new version (e.g. `v1.1.0`) and update the two URLs in the embed.
Alternative: paste the CSS in `<style>` and the JS in `<script type="module">` in the template page's custom code
(no external repo, but harder to update and close to Webflow's custom-code length limits).

PDF.js and StPageFlip are loaded from jsDelivr automatically by flipbook.js.
Already checked: Webflow's file CDN sends `Access-Control-Allow-Origin: *` and supports range requests,
so the viewer can read PDFs straight from the CMS and loads only the pages it needs.

## 4. Buttons on the site

Point the existing download buttons to the CMS item page (Link → Collection page → item), "Open in new tab".
Short links for print or QR codes: Site settings → Publishing → 301 redirects, e.g.
`/bilancio` → `/pubblicazioni/bilancio-sostenibilita-2025` (update it each year without reprinting).

## 5. Customising the look

Override the CSS variables on the embed div or in the site styles:

```css
.sfb {
  --sfb-bg: #ebeae6;       /* stage background */
  --sfb-surface: #fff;     /* toolbar, drawer */
  --sfb-ink: #1e2522;      /* icons, text */
  --sfb-accent: #2f6b4f;   /* focus ring, progress bar, current thumbnail */
}
```

The UI is in Italian by default; `data-lang="en"` (or `<html lang="en">`) switches it to English.

## Features

Page-turn animation · two-page spreads with cover on desktop, single page on phones · swipe/drag/click/keyboard
· page number box (type a page to jump) · thumbnails · zoom up to 400% with drag to pan · full screen
· share (native share sheet on phones, copy link on desktop) · download · links to a page (`#page/78`)
· renders only the pages near the current one (fine for 100+ page documents).

## Known limits (possible later additions)

- Text in the flipbook isn't selectable or searchable, and links inside the PDF aren't clickable (the downloaded PDF has both).
- Pinch-to-zoom on the book itself isn't supported; zoom uses the zoom button.
