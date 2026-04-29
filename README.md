<p align="center">
  <img src="img/banner.png" style="max-width:100%;">
</p>

# D3 Graphentheorie – Spezialwerkzeuge für TSS und InfNet

Dieses Projekt ist eine interaktive Lernplattform für Graphentheorie, die um zwei leistungsstarke Simulationswerkzeuge erweitert wurde: **Target Set Selection (TSS)** und **Influence Networks (InfNet)**. Diese Tools ermöglichen die visuelle Analyse von Ausbreitungsdynamiken und Einflussstrukturen in komplexen Netzwerken.

## Fokus der Erweiterungen

Der Schwerpunkt dieser Version liegt auf der technischen Implementierung von Modellen der Meinungsdynamik und der strategischen Knotenaktivierung.

### 1. Target Set Selection (TSS)
Das TSS-Tool widmet sich dem Problem der Identifizierung einer minimalen Menge an Startknoten (Target Set), um eine kaskadenartige Aktivierung im gesamten Netzwerk auszulösen.

#### Programmatische Logik
*   **Zustandsdefinition:** Jeder Knoten $v \in V$ befindet sich in einem Zustand $s(v) \in \{0, 1\}$, wobei $1$ "aktiviert" (rot) und $0$ "inaktiv" (weiß) bedeutet.
*   **Aktivierungsschwelle:** Jedem Knoten ist ein Schwellenwert $t(v) \in \mathbb{N}_0$ zugeordnet.
*   **Zustandsübergang (Update-Regel):** In jeder Iteration $i$ wird der Zustand eines Knotens $v$ wie folgt bestimmt:
    $$s_{i}(v) = 1 \text{ falls } s_{i-1}(v) = 1 \text{ ODER } |\{u \in N(v) : s_{i-1}(u) = 1\}| \ge t(v)$$
    Hierbei ist $N(v)$ die Menge der Nachbarn von $v$. Einmal aktivierte Knoten bleiben dauerhaft aktiv (Monotonie).
*   **Simulationsmodi:**
    *   **Einzelschritt:** Berechnet $s_{i}$ für alle $v$ basierend auf $s_{i-1}$.
    *   **Stabilisierung:** Wiederholt die Update-Regel, bis $s_{i} = s_{i-1}$ für alle Knoten gilt.

### 2. Influence Networks (InfNet)
Das InfNet-Tool simuliert komplexe Meinungsdynamiken unter Verwendung der Mehrheitsregel und spezieller Gadgets zur mathematischen Stabilisierung.

#### Kern-Logik: Die Mehrheitsregel (Majority Rule)
Im Gegensatz zu TSS ist die Dynamik hier nicht zwingend monoton. Ein Knoten $v$ übernimmt die Meinung der Mehrheit seiner Nachbarn:
*   **Meinungszustand:** $o(v) \in \{0, 1\}$ (0: Weiß, 1: Schwarz).
*   **Update-Regel:**
    $$o_{neu}(v) = 
    \begin{cases} 
    1 & \text{wenn } |\{u \in N(v) : o(u) = 1\}| > |\{u \in N(v) : o(u) = 0\}| \\
    0 & \text{wenn } |\{u \in N(v) : o(u) = 0\}| > |\{u \in N(v) : o(u) = 1\}| \\
    o_{alt}(v) & \text{bei Gleichstand}
    \end{cases}$$

#### Technische Gadget-Konstruktion
Um komplexe Schwellenwerte innerhalb der Mehrheitsregel abzubilden, implementiert InfNet automatisierte Gadgets:

1.  **Stabilizer-Gadget:** Besteht aus einem Aktivator $v^*$ und Connectoren.
    *   **Connectoren:** Jeder Hauptknoten $v$ erhält für jede Kante zu einem anderen Hauptknoten zwei Connector-Typen:
        *   **Weißer Connector:** Verbunden mit $v$ und $v^*$. Er besitzt eine interne Pfadstruktur (zwei Hilfsknoten mit festem Zustand 1), die einen konstanten Bias von $+2$ für die Meinung 1 liefert.
        *   **Schwarzer Connector:** Verbunden mit $v$ und $v^*$. Er besitzt zwei "Blätter" (Zustand 1), die ebenfalls einen Bias liefern.
2.  **Dummy-Knoten (Externer Einfluss $y$):**
    *   **$y > 0$:** Erzeugt $2y$ weiße Dummies ($o=0$), die direkt mit $v$ verbunden sind. Dies erhöht das Gewicht der Meinung 0 um $2y$.
    *   **$y < 0$:** Erzeugt $-2y$ schwarze Dummy-Paare. Jedes Paar besteht aus zwei verbundenen schwarzen Knoten ($o=1$), wobei einer mit $v$ verbunden ist. Dies erhöht das Gewicht der Meinung 1 um $-2y$.

#### Update-Sequenzen & Asynchronität
Die Simulation unterstützt asynchrone Updates. Über ein JSON-Array kann eine präzise Sequenz (z. B. `["A", "B"]`) definiert werden. Nur die in der Sequenz gelisteten Knoten führen die `performUpdateStep`-Logik in der vorgegebenen Reihenfolge aus, was die Untersuchung von Timing-Effekten in der Netzwerkdynamik ermöglicht.

## Technische Details
Die Erweiterungen nutzen **D3.js (v5)** für die grafische Darstellung und die physikalische Simulation. Die gesamte Logik der Zustandsübergänge, Gadget-Hierarchien und Kraftberechnungen ist in `js/infnet-app.js` und `js/tss-app.js` implementiert. Das Projekt folgt einem rein Frontend-basierten Ansatz und erfordert keine serverseitige Logik oder Build-Tools.

## Nutzung
1. Repository klonen.
2. `index.html` für die Grundlagen der Graphentheorie aufrufen.
3. `tss.html` oder `infnet.html` direkt im Browser öffnen, um die spezialisierten Simulationen zu nutzen.

---
*Erstellt im Rahmen einer Erweiterung zur detaillierten Untersuchung von Ausbreitungsprozessen in Graphen.*
