# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Eine einzige Person: der Betreiber (Neo), der seine eigenen Linux-Geräte (Server, Raspberry Pis, Rechner) für Claude erreichbar macht. Kein Multi-User, keine Rollen. Das Web-Panel öffnet er meist am Laptop/Desktop, typischerweise während er per SSH ein neues Gerät einrichtet; das Handy dient nur zum Nachschauen. Realistisch verwaltet das Panel 1 bis 5 Geräte.

## Product Purpose

device-mcp ist ein selbst gehosteter MCP-Server, über den Claude (claude.ai, Handy-App, Claude Code) auf den Geräten des Betreibers Befehle ausführt und Dateien liest und schreibt. Auf jedem Gerät läuft ein Daemon, der sich per WebSocket beim Server meldet. Das Panel ist die Verwaltung dazu: Geräte anlegen (Token wird genau einmal angezeigt, mit fertigem Install-Befehl), umbenennen, deaktivieren, löschen, Token neu erzeugen, Online-Status prüfen und nachvollziehen, was Claude auf welchem Gerät getan hat (Audit-Log). Erfolg: ein neues Gerät ist in unter einer Minute verbunden, und jeder Befehl von Claude ist nachvollziehbar.

## Positioning

Ein Werkzeug für genau einen Menschen und seine eigenen Maschinen, selbst gehostet auf Coolify. Die Daemons verbinden sich von sich aus (keine offenen Ports auf den Geräten), Jobs überleben Verbindungsabbrüche, und jede Aktion von Claude landet mit Exit-Code und Dauer im Audit-Log.

## Operating Context

- Gerät hinzufügen: Name eingeben, Token und Install-Befehl kopieren, im SSH-Terminal des Geräts einfügen, warten bis das Gerät online erscheint.
- Gelegentliches Nachsehen: Ist ein Gerät online, wann zuletzt gesehen, was hat Claude ausgeführt.
- Einrichtung der Clients: MCP-URL `/mcp` mit Header `Authorization: Bearer <MCP_TOKEN>` in claude.ai (Custom Connector) und Claude Code (`claude mcp add --transport http …`).

## Capabilities and Constraints

- Login nur mit einem Passwort aus der `.env`, Session-Cookie, Rate-Limit.
- Geräte-Token und MCP-Token sind Geheimnisse: Der Geräte-Token erscheint genau einmal, der MCP-Token nie im Panel.
- Daemon vorerst nur Linux (systemd-User-Service).
- Oberfläche, Fehlermeldungen und Doku auf Deutsch, Code-Bezeichner Englisch.
- Stack: Nuxt-SPA (`ssr: false`), von Fastify ausgeliefert, Panel-API unter `/v1`.

## Brand Commitments

Name: device-mcp. Darf auf keinen Fall wie ein generisches, austauschbares Admin-Dashboard aussehen (vom Betreiber ausdrücklich genannt).

## Evidence on Hand

Keine Logos, Bilder oder Markenassets. Echte Inhalte sind die Gerätedaten (Name, Hostname, OS, Architektur, Kernel, Benutzer) und Audit-Einträge (Tool, Befehl, Exit-Code, Dauer), die der laufende Server liefert.

## Product Principles

1. Ein Geheimnis wird einmal gezeigt und dann nie wieder: Kopieren muss beim ersten Mal sicher gelingen.
2. Status vor Dekoration: online/offline und „zuletzt gesehen“ sind auf einen Blick lesbar.
3. Nachvollziehbarkeit: Was Claude getan hat, ist pro Gerät vollständig und ehrlich sichtbar, auch Fehler.
4. Wenige Geräte, viel Klarheit: Jedes Gerät darf Raum bekommen statt in einer dichten Tabelle zu verschwinden.
