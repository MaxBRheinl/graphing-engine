<p align="center">
  <img src="img/banner.png" style="max-width:100%;">
</p>

# D3 Graphentheorie – Spezialwerkzeuge für TSS und InfNet

Dieses Projekt ist eine interaktive Lernplattform für Graphentheorie, die um zwei leistungsstarke Simulationswerkzeuge erweitert wurde: **Target Set Selection (TSS)** und **Influence Networks (InfNet)**. Diese Tools ermöglichen die visuelle Analyse von Ausbreitungsdynamiken und Einflussstrukturen in komplexen Netzwerken.

## Fokus der Erweiterungen

Der Schwerpunkt dieser Version liegt auf der technischen Implementierung von Modellen der Meinungsdynamik und der strategischen Knotenaktivierung.

### 1. Target Set Selection (TSS)
Das TSS-Tool widmet sich dem Problem der Identifizierung einer minimalen Menge an Startknoten (Target Set), um eine kaskadenartige Aktivierung im gesamten Netzwerk auszulösen.

*   **Schwellenwert-Logik (Threshold Model):** Jeder Knoten $v$ hat einen individuellen Schwellenwert $t(v)$. Ein Knoten wechselt in den aktiven Zustand, sobald die Anzahl seiner bereits aktiven Nachbarn den Wert $t(v)$ erreicht oder überschreitet.
*   **Dynamische Konfiguration:** Schwellenwerte können zur Laufzeit für jeden Knoten individuell über das User Interface angepasst werden.
*   **Simulationssteuerung:**
    *   **Update Schritt:** Manuelle Durchführung einzelner Iterationen zur Beobachtung der schrittweisen Kaskade.
    *   **Bis Stabil:** Automatisierte Ausführung der Simulation bis zum Erreichen eines Fixpunktes (Steady State), an dem keine weiteren Aktivierungen mehr erfolgen.
*   **Interaktion:** Intuitive Graphenerstellung via D3-Drag-and-Drop. Über `Alt + Klick` lassen sich Knoten direkt als Teil des initialen Target Sets markieren.

### 2. Influence Networks (InfNet)
Das InfNet-Tool stellt eine fortgeschrittene Simulationsumgebung für komplexe Einflussmodelle dar. Es erweitert einfache Schwellenwertmodelle um mathematische Konzepte wie Stabilizer-Gadgets und externe Bias-Einflüsse.

*   **Spezialisierte Knotenarchitektur:**
    *   **Hauptknoten (Main Nodes):** Die zentralen Entitäten, deren Meinungsausbreitung untersucht wird.
    *   **Stabilizer-Gadgets:** Komplexe Substrukturen bestehend aus **Connectoren** und **Aktivatoren**. Diese Gadgets werden genutzt, um mathematisch definierte Einflussbedingungen zu stabilisieren und die Dynamik innerhalb des Graphen exakt zu steuern.
    *   **Dummy-Knoten:** Repräsentation von externen Einflüssen (y-Werte). Positive y-Werte erzeugen weiße Dummies, negative y-Werte erzeugen schwarze Dummy-Paare zur Simulation von System-Bias.
*   **Algorithmisches Layout & Kraftsimulation:** 
    *   Implementierung maßgeschneiderter D3-Forces (`force-gadget`) zur automatisierten, radialen Positionierung von Gadgets um die zugehörigen Hauptknoten.
    *   **Intelligente Ausrichtung:** Unterstützung von Shortcuts zur Optimierung der Topologie: `T` zum Ausrichten von Connectoren, `R` zur Neuorientierung von Gadgets und `O` für ein globales, intelligentes Arrangement des Graphen.
*   **Update-Sequenzen:** Definition präziser Aktivierungsreihenfolgen mittels JSON-Input (z. B. `["A", "B", "C"]`). Dies ermöglicht die Untersuchung asynchroner Dynamiken und deren Einfluss auf das Konvergenzverhalten des Netzwerks.
*   **Export-Features:** Integrierte Funktion zum Export der aktuellen Graphenkonfiguration als Bilddatei für die Dokumentation und Analyse.

## Technische Details
Die Erweiterungen nutzen **D3.js (v5)** für die grafische Darstellung und die physikalische Simulation. Die gesamte Logik der Zustandsübergänge, Gadget-Hierarchien und Kraftberechnungen ist in `js/infnet-app.js` und `js/tss-app.js` implementiert. Das Projekt folgt einem rein Frontend-basierten Ansatz und erfordert keine serverseitige Logik oder Build-Tools.

## Nutzung
1. Repository klonen.
2. `index.html` für die Grundlagen der Graphentheorie aufrufen.
3. `tss.html` oder `infnet.html` direkt im Browser öffnen, um die spezialisierten Simulationen zu nutzen.

---
*Erstellt im Rahmen einer Erweiterung zur detaillierten Untersuchung von Ausbreitungsprozessen in Graphen.*
