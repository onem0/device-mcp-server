---
version: 1
slug: "panel-app"
primary_target: "panel/app"
related_targets: []
---

# Surface: device-mcp Panel

Scope: the whole web panel (login, device overview, adding a device, device detail with audit log, connection). Mode: Operate.
Task: add a device and reliably copy the one-time install command; read the online status and "last seen"; trace what Claude ran per device. Mostly on the desktop, 1–5 devices. The operator's no-go: generic admin look.

## Direction contract

THESIS: Every device wears its label: the device name sits on laminated label tape, the way it sticks to Raspis and switches in a homelab. What is refused is the standard admin made of a slate sidebar, metric tiles and a pill table.

OWN-WORLD: Matt workbench surface (#eceee9) with light cards made of cardboard; white tape with black, narrow-cut bold capitals (Archivo, width 68%) for device names, black tape for the wordmark, yellow tape (#f4d21f) only for the one-time secret. Type only in tape black and one grey, green for online, red for errors. Archivo everywhere, JetBrains Mono only for commands, paths, tokens and measured values. Three type sizes, rank through weight and capitals. Facts in fixed cells.

STORY: The operator sees at once which devices are online and when each was last there, adds a device with a name and a copied command, watches it come online live and can look up every command from Claude with exit code and duration.

FIRST VIEWPORT: Header 72 px: black "device-mcp" tape on the left, next to it the navigation Devices/Connection, Log out on the right. Below it two columns: on the left the heading "Devices · n" with the primary button "Add device", below it one card per device with name tape, status dot and text, last seen, actions on the right, four fact cells (user@host, system, architecture/kernel, daemon). On the right, 400 px, the connection card with MCP URL, header and claude mcp add command, each copyable.

FORM: Label tape, position 5 of 7 on my ordered list, seed:92089b05307692e4. Signature: the one-time token runs out of the top edge of the dialog as yellow tape, as if from a label printer, once; on closing it is cut off and can never be retrieved again. Disabled devices keep their tape, struck through. Renaming reprints the tape in place.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Open points

- No dark mode: workbench in daylight at the desk, deliberately light.
