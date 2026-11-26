---
name: device-mcp Panel
description: Workbench with label tape. Every device wears its label.
colors:
  ground: "#eceee9"
  card: "#f7f8f5"
  raised: "#fcfcfa"
  ink: "#151515"
  mute: "#585d55"
  line: "#d5d8d0"
  line-strong: "#b4b8af"
  tape-white: "#fbfbf7"
  tape-black: "#1b1b1b"
  tape-yellow: "#f4d21f"
  ok: "#1f8f4e"
  err: "#b3301d"
  err-soft: "#f6e2dc"
typography:
  tape:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0.05em"
    fontVariation: "'wdth' 68"
  tape-small:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0.05em"
    fontVariation: "'wdth' 68"
  title:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 800
    lineHeight: 1.2
  body:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'tnum'"
  label:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    letterSpacing: "0.1em"
  small:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  tape: "4px"
  control: "6px"
  panel: "8px"
  card: "10px"
  dialog: "12px"
spacing:
  xs: "0.4rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 1rem"
    height: "2.5rem"
  button-primary-hover:
    backgroundColor: "#2d2d2d"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 1rem"
    height: "2.5rem"
  button-danger:
    backgroundColor: "{colors.err}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "0 1rem"
    height: "2.5rem"
  button-danger-hover:
    backgroundColor: "#962817"
  action:
    backgroundColor: "transparent"
    textColor: "{colors.mute}"
    typography: "{typography.small}"
    rounded: "{rounded.control}"
    padding: "0 0.6rem"
    height: "2.25rem"
  action-danger-hover:
    backgroundColor: "{colors.err-soft}"
    textColor: "{colors.err}"
  input:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 0.85rem"
    height: "2.75rem"
  label-tape:
    backgroundColor: "{colors.tape-white}"
    textColor: "{colors.ink}"
    typography: "{typography.tape}"
    rounded: "{rounded.tape}"
    padding: "0.25rem 0.9rem 0.2rem"
    height: "2.25rem"
  label-tape-black:
    backgroundColor: "{colors.tape-black}"
    textColor: "{colors.tape-white}"
    typography: "{typography.tape}"
    rounded: "{rounded.tape}"
  label-tape-yellow:
    backgroundColor: "{colors.tape-yellow}"
    textColor: "{colors.ink}"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    padding: "1.35rem 1.5rem"
  card-raised:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.card}"
    padding: "1.35rem 1.5rem"
  copy-field:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.control}"
    padding: "0.6rem 0.75rem"
  banner-error:
    backgroundColor: "{colors.err-soft}"
    textColor: "{colors.err}"
    rounded: "{rounded.panel}"
    padding: "0.75rem 1rem"
  dialog:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.dialog}"
    padding: "1.75rem"
    width: "min(36rem, calc(100vw - 2rem))"
---

# Design System: device-mcp Panel

## Overview

**Creative North Star: "The labelled workbench"**

The panel is a matt, light workbench with cards made of cardboard lying on it. Every device wears its name on laminated label tape, the way it sticks to Raspis and switches in a homelab: narrow-cut, bold Archivo capitals on white tape. The tape is the only design statement; everything else is a calm work surface with fixed fact cells, monospace for everything you need to copy or look up, and a status dot that says at a glance whether a device is there.

The density is generous because there are only one to five devices: each device gets a card of its own instead of a row in a dense table. Type knows only tape black and one grey; colour appears exclusively as meaning (green for online, red for errors, yellow for the one-time secret). Rank comes from weight and capitals, not from size; there are exactly three type sizes.

Deliberately rejected (brand requirement from PRODUCT.md): the generic admin dashboard made of a dark sidebar, metric tiles and tables with status pills. The panel is deliberately light only; there is no dark mode.

**Key Characteristics:**
- Device names and the wordmark sit on label tape, never as an ordinary heading.
- Three type sizes, rank through weight and capitals.
- Facts sit in fixed cells: the same fact in the same place on every card.
- JetBrains Mono only for commands, paths, tokens, IDs and measured values.
- Flat, warm neutrals; accent colour only as a carrier of meaning.
- Motion is mechanical and one-off: tape is printed, cut off, reprinted.

## Colors

A matt, slightly green-tinted neutral palette with three tape colours and two signal colours; no decorative accent colour.

### Primary
- **Tape black** (`ink`): text, primary buttons, focus ring, active navigation, text selection. The only "brand colour" is ink.

### Secondary
- **Label white** (`tape-white`): ground of the name tape for every device.
- **Wordmark black** (`tape-black`): tape of the "device-mcp" wordmark and the printer slot in the token dialog.

### Tertiary
- **Secret yellow** (`tape-yellow`): exclusively the yellow tape that stands for the device token. The token is shown there hidden (prefix and 24 dots); it can be copied only this one time.

### Neutral
- **Workbench** (`ground`): page ground; also the ground of the copy fields and of the waiting row in the token dialog, so that copyable values look as if set into the workbench.
- **Cardboard** (`card`): device cards. Disabled devices sink to a slightly darker cardboard (#eef0eb).
- **Light cardboard** (`raised`): connection card, audit log, login card, dialogs; surfaces for reading and copying.
- **Grey** (`mute`): the only second text colour: field labels, hints, times, actions at rest.
- **Hairline** (`line`): card border, dividers between fact row and header, table rows.
- **Strong line** (`line-strong`): border of the input fields and of the quiet button, bottom edge of the table header, scrollbar.

### Signal
- **Online green** (`ok`): "online" status dot (with a 3px halo at 16% opacity), "Copied" confirmation. Successful connection in the token dialog on a light green field (#e3f1e8, text #155f35).
- **Error red** (`err`) and **Error pink** (`err-soft`): error texts, error banners, Delete button, hover of the Delete action, "Error" result and exit codes other than 0 in the audit log.

### Named Rules
**The Ink-Only Rule.** Text is set in `ink` or `mute`, nothing else. Green and red carry status, never structure or decoration.

**The One Secret Rule.** Yellow appears only where a secret is within reach exactly once. It is never on screen in plain text: tape and install command show the token hidden, the copy buttons deliver the real value. No yellow hint, no yellow button, no yellow highlight anywhere else.

## Typography

**Display Font:** Archivo Variable with width axis (fallback Archivo, system-ui), self-hosted
**Body Font:** Archivo Variable
**Label/Mono Font:** JetBrains Mono 400/600 (fallback ui-monospace, SF Mono, Menlo)

**Character:** A single grotesque in two guises: normal width for body text and controls; condensed to 68% width, bold and uppercase for the tape. Plus a sober monospace for everything machine-readable. Figures are tabular everywhere.

### Hierarchy
Three sizes: large (`--fs-l`), medium (`--fs-m`), small (`--fs-s`).
- **Tape** (800, large, 1.1, 0.05em, uppercase, width 68%): device names and wordmark; small (medium size) for the wordmark in the header and the name tape in the token dialog.
- **Title** (800, large, 1.2): dialog titles and "Log in". Normal width, mixed case.
- **Body** (400, medium, 1.5): body text, navigation (700), status text (700 for the state, 400 grey for the detail), buttons (700).
- **Label** (700, small, 0.1em, uppercase): section titles ("Devices · n", "Connection", "Audit log · n entries"), fact labels, copy field labels, table headers. Grey when it labels a field; ink when it names a section.
- **Small** (400 or 600, small, 1.5): hints, error texts (600, red), text actions (600).
- **Mono** (400, small, 1.55): fact values, commands, URLs, paths, IDs, timestamps and durations in the audit log; the token on the yellow tape in 600.

### Named Rules
**The Three Sizes Rule.** There are exactly three type sizes. Whoever needs more rank uses weight or capitals, never a fourth size. (Only exception in the build: the job ID in the audit log at 0.75rem.)

**The Machine Text Rule.** Whatever is copied, typed or compared is set in JetBrains Mono; everything a human reads, in Archivo.

## Layout

The page has a 72px high header (wordmark on the left, navigation next to it, Log out on the right, hairline below). The content sits in an 84rem frame with 3rem padding, at least 1rem on narrow screens. The overview has two columns: on the left the device cards one below the other (gap 1rem), on the right a 25rem wide connection column that sticks while scrolling, column gap 2.5rem. Below 1040px this becomes one column.

Inside a device card: header with tape and status in a wrapping row, below it the fact row with fixed cells (four columns, two below 720px), below that the text actions flush left. The detail page shows the same cells extended (seven facts, four columns) and below them the audit log as a full-width table. Below 720px the table turns into two-column entries, the actions show only icons (except Enable/Disable), and the navigation moves into a row of its own.

Copy fields respond to their own width (container query 26rem): below that the copy button loses its text and multi-line commands wrap instead of being cut off. Body text is limited to 60 to 70ch.

Spacing rhythm: 0.4rem between label and value, 0.75rem within rows, 1rem between elements of a card, 1.5rem card padding at the sides, 2.5rem between columns and below the header.

## Elevation & Depth

Largely flat with a small, physical shadow logic: cardboard lies on the workbench, tape sticks to the cardboard, a dialog floats above. Cards have a hairline and a barely visible double shadow; otherwise depth comes from the three neutrals (workbench, cardboard, light cardboard). The tape is the only element with a gloss of its own: a vertical light gradient on the upper half, a tight edge shadow and a fine inner outline.

### Shadow Vocabulary
- **Card** (`box-shadow: 0 1px 2px rgba(21,21,21,0.06), 0 2px 8px rgba(21,21,21,0.04)`): every `.card`.
- **Tape** (`box-shadow: 0 1px 1.5px rgba(21,21,21,0.22), 0 2px 6px rgba(21,21,21,0.06), inset 0 0 0 1px rgba(21,21,21,0.06)`): the stuck-on label.
- **Dialog** (`box-shadow: 0 24px 60px rgba(21,21,21,0.28), 0 4px 12px rgba(21,21,21,0.12)`): modal sheets over a 45% ink dimming.

### Named Rules
**The Stuck-On Rule.** The tape may shine and cast an edge shadow because it is a physical label. This treatment belongs to the tape; buttons, copy fields and cards do not get it.

## Shapes

Slightly rounded rectangles in a fixed scale by size: tape 4px (like a label cut to size), controls and copy fields 6px, banners and status fields 8px, cards 10px, dialogs 12px. The token strip is almost square-cornered (1px), the printer slot a black pill. The only round shape is the status dot. Borders are 1px hairlines; the quiet button and the copy field draw their outline as an inset shadow instead of a border.

## Components

### Buttons
Clear, compact, ink black.
- **Shape:** gently rounded (6px), minimum height 2.5rem.
- **Primary:** ink with white text, 700, icon on the left with a 0.45rem gap. Hover darkens to #2d2d2d. One primary button per view ("Add device", "Save", "Done", "Log in").
- **Quiet:** transparent with a 1px inner outline in `line-strong`, hover 5% ink. For Cancel and "Load older".
- **Danger:** error red, hover #962817. Only as the confirmation in the delete dialog.
- **Disabled:** 55% opacity, cursor "not-allowed".
- **Focus:** global 2px ink ring with a 2px offset.

### Text actions
- **Style:** borderless, grey, 600 small, 16px Lucide icon on the left, minimum height 2.25rem. Hover: 6% ink surface and ink text; Delete turns pink/red on hover.
- **Use:** Audit log, Rename, New token, Enable/Disable, Delete, All devices, Log out.

### Cards / Containers
- **Corner Style:** 10px.
- **Background:** `card` for device cards, `raised` for reading and copying surfaces (connection, audit log, login).
- **Shadow Strategy:** card shadow (see Elevation).
- **Border:** 1px `line`.
- **Internal Padding:** about 1.35rem at the top, 1.5rem at the sides.

### Inputs / Fields
- **Style:** white field, 1px `line-strong`, 6px, height 2.75rem, label above (700 small).
- **Focus:** border and 2px ring in ink, without offset.
- **Error:** red text 600 small below the field, `aria-invalid`.

### Copy field
Value in mono on workbench ground, as a recessed groove (6px, inner outline `line`), on the right a copy button with icon and text, separated by a hairline; after copying, a green "Copied" for two seconds. The whole value can be selected with one click. If the value contains a secret, the field shows it hidden (`display`), is not selectable and copies the real value via the button. Multi-line commands keep their lines and scroll horizontally; in narrow containers they wrap.

### Navigation
Archivo 700 medium, grey; hover ink; active ink with a 2px underline at the bottom edge of the header. On mobile a row of its own below wordmark and Log out.

### Status mark
Dot (0.6rem) plus bold state plus grey detail: online filled green with a halo; offline, waiting and disabled as an empty grey ring. The detail always says since when or when last.

### Fact cells
`dl` as a grid of fixed cells below a hairline: label uppercase grey, value in mono, wraps anywhere. Missing values as a dash, never as an empty cell.

### Label tape (signature)
The label: white for device names, black for the wordmark, yellow for the token. Linked tapes lift by 1px on hover. A disabled device keeps its tape, struck through (2px) and grey. Renaming turns the tape into an input field in tape shape and then reprints it from left to right (480ms, linear). In the token dialog the yellow tape runs once out of a black slot at the top edge of the dialog (700ms) and is cut off on closing (260ms). If no motion is wanted, it is simply there. An empty state shows a tape only as a 2px outline without fill.

### Audit table
Plain table without pills: uppercase grey headers, hairlines between rows, time and duration in mono (duration right-aligned), result as bold text (ink for ok/exit 0, red for errors, grey for killed/running). Long commands clamped to two lines with "Details".

### Dialog
Native `dialog` on light cardboard, 12px, up to 36rem wide, 1.75rem padding, actions right-aligned.

## Do's and Don'ts

### Do:
- **Do** set every device name on `label-tape`, in the list as well as in the detail view and the dialog.
- **Do** add new facts as another fixed cell in `DeviceFacts`, with a dash as the empty value.
- **Do** build rank through 700/800 and capitals, within the three sizes (0.8125, 0.9375, 1.375rem).
- **Do** always show copyable values in the copy field, in JetBrains Mono on `ground`.
- **Do** show status as dot plus word plus time, never as colour alone.
- **Do** keep motion mechanical and one-off (`cubic-bezier(0.16, 1, 0.3, 1)`, 150ms for states) and respect `prefers-reduced-motion`.

### Don't:
- **Don't** introduce status pills, metric tiles or a dark sidebar; that is the rejected admin standard.
- **Don't** use `tape-yellow` outside the secret that is shown once.
- **Don't** set text in any colour other than `ink` or `mute`, except error red and success green as status.
- **Don't** introduce a fourth type size.
- **Don't** transfer the tape's gloss and edge shadow to buttons, cards or copy fields.
- **Don't** set small uppercase lines as a kicker above headings; capitals label sections, fields and columns, they do not sit decoratively above a title.
