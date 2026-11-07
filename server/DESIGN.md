---
name: device-mcp Panel
description: Werkbank mit Beschriftungsband. Jedes Gerät trägt sein Etikett.
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

**Creative North Star: "Die beschriftete Werkbank"**

Das Panel ist eine matte, helle Werkbank, auf der Karten aus Karton liegen. Jedes Gerät trägt seinen Namen auf laminiertem Beschriftungsband, so wie es im Homelab auf Raspis und Switches klebt: schmal geschnittene, fette Archivo-Versalien auf weißem Band. Das Band ist der einzige gestalterische Auftritt; alles andere ist ruhige Arbeitsfläche mit festen Faktenzellen, Monospace für alles, was man kopieren oder nachlesen muss, und einem Statuspunkt, der auf einen Blick sagt, ob ein Gerät da ist.

Die Dichte ist großzügig, weil es nur ein bis fünf Geräte gibt: Jedes Gerät bekommt eine eigene Karte statt einer Zeile in einer dichten Tabelle. Schrift kennt nur Bandschwarz und ein Grau; Farbe tritt ausschließlich als Bedeutung auf (Grün für online, Rot für Fehler, Gelb für das einmalige Geheimnis). Rang entsteht über Gewicht und Versalien, nicht über Größe; es gibt genau drei Schriftgrade.

Bewusst abgelehnt (Markenvorgabe aus PRODUCT.md): das generische Admin-Dashboard aus dunkler Seitenleiste, Kennzahlen-Kacheln und Tabellen mit Status-Pillen. Das Panel ist bewusst nur hell; es gibt keinen Dark Mode.

**Key Characteristics:**
- Gerätenamen und Wortmarke stehen auf Beschriftungsband, nie als normale Überschrift.
- Drei Schriftgrade, Rang über Gewicht und Versalien.
- Fakten stehen in festen Zellen: derselbe Fakt an derselben Stelle auf jeder Karte.
- JetBrains Mono nur für Befehle, Pfade, Tokens, IDs und Messwerte.
- Flache, warme Neutraltöne; Akzentfarbe nur als Bedeutungsträger.
- Bewegung ist mechanisch und einmalig: Band wird gedruckt, abgeschnitten, neu gedruckt.

## Colors

Eine matte, leicht grünstichige Neutralpalette mit drei Bandfarben und zwei Signalfarben; keine dekorative Akzentfarbe.

### Primary
- **Bandschwarz** (`ink`): Text, Primärbuttons, Fokusring, aktive Navigation, Textauswahl. Die einzige „Markenfarbe“ ist Tinte.

### Secondary
- **Etikettenweiß** (`tape-white`): Grund des Namensbands für jedes Gerät.
- **Wortmarkenschwarz** (`tape-black`): Band der Wortmarke „device-mcp“ und der Druckerschlitz im Token-Dialog.

### Tertiary
- **Geheimnisgelb** (`tape-yellow`): ausschließlich das gelbe Band, auf dem der Geräte-Token genau einmal erscheint.

### Neutral
- **Werkbank** (`ground`): Seitengrund; auch Grund der Kopierfelder und der Warte-Zeile im Token-Dialog, damit kopierbare Werte wie in die Werkbank eingelassen wirken.
- **Karton** (`card`): Gerätekarten. Deaktivierte Geräte sinken auf einen etwas dunkleren Karton (#eef0eb).
- **Heller Karton** (`raised`): Verbindungskarte, Audit-Log, Login-Karte, Dialoge; Flächen, auf denen gelesen und kopiert wird.
- **Grau** (`mute`): die einzige zweite Textfarbe: Feldbeschriftungen, Hinweise, Zeitangaben, ruhende Aktionen.
- **Haarlinie** (`line`): Kartenrand, Trennlinien zwischen Faktenzeile und Kopf, Tabellenzeilen.
- **Kräftige Linie** (`line-strong`): Rand der Eingabefelder und des ruhigen Buttons, Tabellenkopf-Unterkante, Scrollbar.

### Signal
- **Online-Grün** (`ok`): Statuspunkt „online“ (mit 3px Hof in 16 % Deckkraft), „Kopiert“-Bestätigung. Erfolgreiche Verbindung im Token-Dialog auf hellgrünem Feld (#e3f1e8, Text #155f35).
- **Fehlerrot** (`err`) und **Fehlerrosa** (`err-soft`): Fehlertexte, Fehlerbanner, Löschen-Button, Hover der Löschen-Aktion, Ergebnis „Fehler“ und Exit-Codes ungleich 0 im Audit-Log.

### Named Rules
**The Ink-Only Rule.** Text steht in `ink` oder `mute`, sonst nichts. Grün und Rot tragen Status, nie Gliederung oder Schmuck.

**The One Secret Rule.** Gelb erscheint nur dort, wo ein Geheimnis genau einmal gezeigt wird. Kein gelber Hinweis, kein gelber Button, keine gelbe Hervorhebung sonst.

## Typography

**Display Font:** Archivo Variable mit Breitenachse (Fallback Archivo, system-ui), selbst gehostet
**Body Font:** Archivo Variable
**Label/Mono Font:** JetBrains Mono 400/600 (Fallback ui-monospace, SF Mono, Menlo)

**Character:** Eine einzige Grotesk in zwei Gestalten: normal breit für Fließtext und Bedienung, auf 68 % Breite gestaucht, fett und versal für das Band. Dazu eine nüchterne Monospace für alles Maschinenlesbare. Ziffern sind überall tabellarisch.

### Hierarchy
Drei Grade: groß (`--fs-l`), mittel (`--fs-m`), klein (`--fs-s`).
- **Band** (800, groß, 1.1, 0.05em, versal, Breite 68 %): Gerätenamen und Wortmarke; klein (mittlerer Grad) für die Wortmarke in der Kopfzeile und das Namensband im Token-Dialog.
- **Titel** (800, groß, 1.2): Dialogtitel und „Anmelden“. Normale Breite, gemischte Schreibung.
- **Body** (400, mittel, 1.5): Fließtext, Navigation (700), Statustext (700 für den Zustand, 400 grau für das Detail), Buttons (700).
- **Beschriftung** (700, klein, 0.1em, versal): Abschnittstitel („Geräte · n“, „Verbindung“, „Audit-Log · n Einträge“), Faktenbeschriftungen, Kopierfeld-Beschriftungen, Tabellenköpfe. Grau, wenn sie ein Feld beschriftet; Tinte, wenn sie einen Abschnitt benennt.
- **Klein** (400 bzw. 600, klein, 1.5): Hinweise, Fehlertexte (600, rot), Textaktionen (600).
- **Mono** (400, klein, 1.55): Faktenwerte, Befehle, URLs, Pfade, IDs, Zeitstempel und Dauern im Audit-Log; der Token auf dem gelben Band in 600.

### Named Rules
**The Three Sizes Rule.** Es gibt genau drei Schriftgrade. Wer mehr Rang braucht, nimmt Gewicht oder Versalien, nie einen vierten Grad. (Einzige Ausnahme im Build: die Job-ID im Audit-Log mit 0.75rem.)

**The Machine Text Rule.** Was kopiert, getippt oder verglichen wird, steht in JetBrains Mono; alles, was ein Mensch liest, in Archivo.

## Layout

Die Seite hat eine 72px hohe Kopfzeile (Wortmarke links, Navigation daneben, Abmelden rechts, Haarlinie darunter). Der Inhalt sitzt in einem 84rem-Rahmen mit 3rem Innenabstand, auf schmalen Schirmen mindestens 1rem. Die Übersicht ist zweispaltig: links die Gerätekarten untereinander (Abstand 1rem), rechts eine 25rem breite, beim Scrollen haftende Verbindungsspalte, Spaltenabstand 2.5rem. Unter 1040px wird daraus eine Spalte.

Innerhalb einer Gerätekarte: Kopf mit Band und Status in einer umbrechenden Zeile, darunter die Faktenzeile mit festen Zellen (vier Spalten, unter 720px zwei), darunter die Textaktionen bündig links. Die Detailseite stellt dieselben Zellen erweitert (sieben Fakten, vier Spalten) dar und darunter das Audit-Log als Tabelle über die volle Breite. Unter 720px wird die Tabelle zu zweispaltigen Einträgen, die Aktionen zeigen nur noch Symbole (außer Aktivieren/Deaktivieren), die Navigation rückt in eine eigene Zeile.

Kopierfelder reagieren auf ihre eigene Breite (Container-Query 26rem): darunter verliert der Kopieren-Button seinen Text und mehrzeilige Befehle brechen um, statt abgeschnitten zu werden. Fließtext ist auf 60 bis 70ch begrenzt.

Abstandsrhythmus: 0.4rem zwischen Beschriftung und Wert, 0.75rem innerhalb von Zeilen, 1rem zwischen Elementen einer Karte, 1.5rem Karteninnenrand seitlich, 2.5rem zwischen Spalten und unter der Kopfzeile.

## Elevation & Depth

Weitgehend flach mit einer kleinen, physischen Schattenlogik: Karton liegt auf der Werkbank, Band klebt auf dem Karton, ein Dialog schwebt darüber. Karten haben eine Haarlinie und einen kaum sichtbaren Doppelschatten; Tiefe entsteht sonst über die drei Neutraltöne (Werkbank, Karton, heller Karton). Das Band ist das einzige Element mit eigenem Glanz: ein senkrechter Lichtverlauf auf der oberen Hälfte, ein knapper Kantenschatten und eine feine Innenkontur.

### Shadow Vocabulary
- **Karte** (`box-shadow: 0 1px 2px rgba(21,21,21,0.06), 0 2px 8px rgba(21,21,21,0.04)`): jede `.card`.
- **Band** (`box-shadow: 0 1px 1.5px rgba(21,21,21,0.22), 0 2px 6px rgba(21,21,21,0.06), inset 0 0 0 1px rgba(21,21,21,0.06)`): das aufgeklebte Etikett.
- **Dialog** (`box-shadow: 0 24px 60px rgba(21,21,21,0.28), 0 4px 12px rgba(21,21,21,0.12)`): modale Blätter über 45 % Tinten-Abdunklung.

### Named Rules
**The Stuck-On Rule.** Das Band darf glänzen und einen Kantenschatten werfen, weil es ein physisches Etikett ist. Diese Behandlung gehört dem Band; Buttons, Kopierfelder und Karten bekommen sie nicht.

## Shapes

Leicht abgerundete Rechtecke in einer festen Stufung nach Größe: Band 4px (wie ein zugeschnittenes Etikett), Bedienelemente und Kopierfelder 6px, Banner und Statusfelder 8px, Karten 10px, Dialoge 12px. Der Token-Streifen ist fast eckig (1px), der Druckerschlitz eine schwarze Pille. Einzig runde Form ist der Statuspunkt. Ränder sind 1px-Haarlinien; der ruhige Button und das Kopierfeld zeichnen ihre Kontur als Innenschatten statt als Border.

## Components

### Buttons
Klar, kompakt, tintenschwarz.
- **Shape:** sanft gerundet (6px), Mindesthöhe 2.5rem.
- **Primary:** Tinte mit weißem Text, 700, Symbol links mit 0.45rem Abstand. Hover dunkelt auf #2d2d2d auf. Ein Primärbutton pro Ansicht („Gerät hinzufügen“, „Speichern“, „Fertig“, „Anmelden“).
- **Quiet:** transparent mit 1px-Innenkontur in `line-strong`, Hover 5 % Tinte. Für Abbrechen und „Ältere laden“.
- **Danger:** Fehlerrot, Hover #962817. Nur als Bestätigung im Löschdialog.
- **Disabled:** 55 % Deckkraft, Cursor „not-allowed“.
- **Focus:** global 2px Tintenring mit 2px Abstand.

### Textaktionen
- **Style:** randlos, grau, 600 klein, Lucide-Symbol 16px links, Mindesthöhe 2.25rem. Hover: 6 % Tintenfläche und Tintentext; Löschen färbt sich beim Hover rosa/rot.
- **Einsatz:** Protokoll, Umbenennen, Token neu, Aktivieren/Deaktivieren, Löschen, Zurück, Abmelden.

### Cards / Containers
- **Corner Style:** 10px.
- **Background:** `card` für Gerätekarten, `raised` für Lese- und Kopierflächen (Verbindung, Audit-Log, Login).
- **Shadow Strategy:** Kartenschatten (siehe Elevation).
- **Border:** 1px `line`.
- **Internal Padding:** etwa 1.35rem oben, 1.5rem seitlich.

### Inputs / Fields
- **Style:** weißes Feld, 1px `line-strong`, 6px, Höhe 2.75rem, Beschriftung darüber (700 klein).
- **Focus:** Rand und 2px-Ring in Tinte, ohne Abstand.
- **Error:** roter Text 600 klein unter dem Feld, `aria-invalid`.

### Kopierfeld
Wert in Mono auf Werkbankgrund, als eingelassene Rinne (6px, Innenkontur `line`), rechts ein durch eine Haarlinie abgetrennter Kopieren-Button mit Symbol und Text; nach dem Kopieren grün „Kopiert“ für zwei Sekunden. Der ganze Wert ist mit einem Klick markierbar. Mehrzeilige Befehle behalten ihre Zeilen und scrollen waagerecht; in schmalen Containern brechen sie um.

### Navigation
Archivo 700 mittel, grau; Hover Tinte; aktiv Tinte mit 2px-Unterstrich an der Unterkante der Kopfzeile. Mobil eigene Zeile unter Wortmarke und Abmelden.

### Statusmarke
Punkt (0.6rem) plus fetter Zustand plus graues Detail: online grün gefüllt mit Hof; offline, wartend und deaktiviert als leerer grauer Ring. Das Detail sagt immer, seit wann oder wann zuletzt.

### Faktenzellen
`dl` als Raster fester Zellen unter einer Haarlinie: Beschriftung versal grau, Wert in Mono, bricht überall um. Fehlende Werte als Gedankenstrich, nie als leere Zelle.

### Beschriftungsband (Signatur)
Das Etikett: weiß für Gerätenamen, schwarz für die Wortmarke, gelb für den Token. Verlinkte Bänder heben sich beim Hover um 1px. Ein deaktiviertes Gerät behält sein Band, durchgestrichen (2px) und grau. Umbenennen verwandelt das Band in ein Eingabefeld in Bandform und druckt es danach von links nach rechts neu (480ms, linear). Im Token-Dialog läuft das gelbe Band einmal aus einem schwarzen Schlitz an der Oberkante des Dialogs heraus (700ms) und wird beim Schließen abgeschnitten (260ms). Ohne Bewegungswunsch ist es einfach da. Ein leerer Zustand zeigt ein Band nur als 2px-Kontur ohne Füllung.

### Audit-Tabelle
Schlichte Tabelle ohne Pillen: versale graue Köpfe, Haarlinien zwischen Zeilen, Zeit und Dauer in Mono (Dauer rechtsbündig), Ergebnis als fetter Text (Tinte für ok/exit 0, rot für Fehler, grau für abgebrochen/läuft). Lange Befehle auf zwei Zeilen gekürzt mit „ganz zeigen“.

### Dialog
Natives `dialog` auf hellem Karton, 12px, bis 36rem breit, 1.75rem Innenrand, Aktionen rechtsbündig.

## Do's and Don'ts

### Do:
- **Do** jeden Gerätenamen auf `label-tape` setzen, in der Liste wie im Detail und im Dialog.
- **Do** neue Fakten als weitere feste Zelle in `DeviceFacts` ergänzen, mit Gedankenstrich als Leerwert.
- **Do** Rang über 700/800 und Versalien bilden, innerhalb der drei Grade (0.8125, 0.9375, 1.375rem).
- **Do** kopierbare Werte immer im Kopierfeld zeigen, in JetBrains Mono auf `ground`.
- **Do** Status als Punkt plus Wort plus Zeitangabe zeigen, nie nur als Farbe.
- **Do** Bewegung mechanisch und einmalig halten (`cubic-bezier(0.16, 1, 0.3, 1)`, 150ms für Zustände) und `prefers-reduced-motion` respektieren.

### Don't:
- **Don't** Status-Pillen, Kennzahlen-Kacheln oder eine dunkle Seitenleiste einführen; das ist der abgelehnte Admin-Standard.
- **Don't** `tape-yellow` außerhalb des einmal gezeigten Geheimnisses verwenden.
- **Don't** Text in einer anderen Farbe als `ink` oder `mute` setzen, außer Fehlerrot und Erfolgsgrün als Status.
- **Don't** einen vierten Schriftgrad einführen.
- **Don't** Glanz und Kantenschatten des Bandes auf Buttons, Karten oder Kopierfelder übertragen.
- **Don't** versale Kleinzeilen als Vorspann über Überschriften setzen; Versalien beschriften Abschnitte, Felder und Spalten, sie stehen nicht dekorativ über einem Titel.
