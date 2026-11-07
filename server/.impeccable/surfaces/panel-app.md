---
version: 1
slug: "panel-app"
primary_target: "panel/app"
related_targets: []
---

# Surface: device-mcp Panel

Scope: das ganze Web-Panel (Login, Geräteübersicht, Gerät anlegen, Gerätedetail mit Audit-Log, Verbindung). Modus: Operate.
Aufgabe: Gerät anlegen und den einmaligen Install-Befehl sicher kopieren; Online-Status und „zuletzt gesehen“ ablesen; nachvollziehen, was Claude pro Gerät ausgeführt hat. Meist am Desktop, 1–5 Geräte. No-Go des Betreibers: generischer Admin-Look.

## Direction contract

THESIS: Jedes Gerät trägt sein Etikett: Der Gerätename steht auf laminiertem Beschriftungsband, wie es im Homelab auf Raspis und Switches klebt. Verweigert wird das Standard-Admin aus Slate-Seitenleiste, Kennzahlen-Kacheln und Pillen-Tabelle.

OWN-WORLD: Matte Werkbank-Fläche (#eceee9) mit hellen Karten aus Karton; weißes Band mit schwarzen, schmal geschnittenen fetten Versalien (Archivo, Breite 68 %) für Gerätenamen, schwarzes Band für die Wortmarke, gelbes Band (#f4d21f) nur für das einmalige Geheimnis. Schrift nur in Bandschwarz und einem Grau, Grün für online, Rot für Fehler. Archivo überall, JetBrains Mono nur für Befehle, Pfade, Tokens und Messwerte. Drei Schriftgrade, Rang über Gewicht und Versalien. Fakten in festen Zellen.

STORY: Der Betreiber sieht sofort, welche Geräte online sind und wann jedes zuletzt da war, legt ein Gerät mit einem Namen und einem kopierten Befehl an, sieht es live online gehen und kann jeden Befehl von Claude mit Exit-Code und Dauer nachlesen.

FIRST VIEWPORT: Kopfzeile 72 px: schwarzes Band „device-mcp“ links, daneben Navigation Geräte/Verbindung, Abmelden rechts. Darunter zwei Spalten: links Überschrift „Geräte · n“ mit Primärbutton „Gerät hinzufügen“, darunter je Gerät eine Karte mit Namensband, Statuspunkt und Text, zuletzt gesehen, Aktionen rechts, vier Faktenzellen (Benutzer@Host, System, Architektur/Kernel, Daemon). Rechts 400 px die Verbindungskarte mit MCP-URL, Header und claude-mcp-add-Befehl, jeweils kopierbar.

FORM: Beschriftungsband, Position 5 von 7 meiner geordneten Liste, seed:92089b05307692e4. Signatur: Der einmalige Token läuft als gelbes Band aus der Oberkante des Dialogs heraus wie aus einem Etikettendrucker, einmal; beim Schließen wird es abgeschnitten und ist nie wieder abrufbar. Deaktivierte Geräte behalten ihr Band, durchgestrichen. Umbenennen druckt das Band an Ort und Stelle neu.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Offene Punkte

- Kein Dark Mode: Werkbank bei Tageslicht am Schreibtisch, bewusst hell.
