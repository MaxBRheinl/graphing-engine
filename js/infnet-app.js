"use strict";

var nodes = [];
var links = [];
var nodeOpinions = {};
var dummyValues = {}; // y-Werte pro Hauptknoten
var fixedPositions = {}; // ID -> {fx, fy}
var deletedNodes = new Set();
var deletedLinks = new Set();
var mainNodeCount = 0;
var manualNodeCount = 0;
var currentDraggedNode = null;
var hoveredNode = null;

var w = window.innerWidth * 0.75;
var h = window.innerHeight;

var svg = d3
  .select("#svg-wrap")
  .append("svg")
  .attr("width", w)
  .attr("height", h)
  .on("mousedown", addNode)
  .on("mousemove", mousemove)
  .on("mouseup", mouseup);

var gridGroup = svg.append("g").attr("class", "grid-group");

var dragLine = svg
  .append("path")
  .attr("class", "dragLine hidden")
  .attr("d", "M0,0L0,0");

var edgesGroup = svg.append("g").attr("class", "edges-group");
var verticesGroup = svg.append("g").attr("class", "vertices-group");
var labelsGroup = svg.append("g").attr("class", "labels-group");

var force = d3
  .forceSimulation()
  .force("charge", d3.forceManyBody().strength(-400).distanceMax(w / 2))
  .force("link", d3.forceLink().id(d => d.id).distance(l => {
      const s = l.source.type || "";
      const t = l.target.type || "";
      if (s === "main" && t === "main") return 240;
      if ((s === "main" || s === "activator") && t.includes("connector")) return 110;
      if ((t === "main" || t === "activator") && s.includes("connector")) return 110;
      if (s.includes("connector") && (t.includes("path") || t.includes("leaf"))) return 45;
      if (t.includes("connector") && (s.includes("path") || s.includes("leaf"))) return 45;
      if (s.includes("path") && t.includes("path")) return 40;
      if (s.includes("dummy") || t.includes("dummy")) return 65;
      return 120;
  }).strength(l => {
      const s = l.source.type || "";
      const t = l.target.type || "";
      if (s.includes("connector") || t.includes("connector")) return 1.5;
      if (s.includes("path") || t.includes("path") || s.includes("leaf") || t.includes("leaf")) return 2.0;
      return 1.0;
  }))
  .force("x", d3.forceX(w / 2).strength(0.05))
  .force("y", d3.forceY(h / 2).strength(0.05))
  .force("collide", d3.forceCollide().radius(d => getRadius(d) + 5).iterations(2))
  .force("gadget", alpha => {
    const mainNodes = nodes.filter(n => n.type === "main");
    mainNodes.forEach(v => {
        const angle = getGadgetAngle(v.id);
        const activatorId = `sa(${v.name})`;
        const activator = nodes.find(n => n.id === activatorId);
        if (activator) {
            const tx = v.x + Math.cos(angle) * 180;
            const ty = v.y + Math.sin(angle) * 180;
            activator.vx += (tx - activator.x) * alpha * 0.2;
            activator.vy += (ty - activator.y) * alpha * 0.2;
        }
    });
  })
  .on("tick", tick);

var mousedownNode = null;
var mouseupNode = null;

const GRID_SIZE = 50;

function drawGrid() {
  gridGroup.selectAll("*").remove();
  for (let x = 0; x <= w; x += GRID_SIZE) {
    gridGroup.append("line")
      .attr("x1", x).attr("y1", 0)
      .attr("x2", x).attr("y2", h)
      .attr("stroke", "#f0f0f0")
      .attr("stroke-width", 1);
  }
  for (let y = 0; y <= h; y += GRID_SIZE) {
    gridGroup.append("line")
      .attr("x1", 0).attr("y1", y)
      .attr("x2", w).attr("y2", y)
      .attr("stroke", "#f0f0f0")
      .attr("stroke-width", 1);
  }
}
drawGrid();

// Radius definitionen (skaliert für D3)
const R_MAIN = 32;
const R_DUMMY = 14;
const R_STAB_ACTIVATOR = 15;
const R_STAB_CONNECTOR = 9;
const R_STAB_LEAF = 8;
const R_STAB_PATH = 8;

function mousemove() {
  if (!mousedownNode) return;
  dragLine.attr("d", "M" + mousedownNode.x + "," + mousedownNode.y + "L" + d3.mouse(this)[0] + "," + d3.mouse(this)[1]);
}

function mouseup() {
  if (mousedownNode) {
    dragLine.classed("hidden", true);
  }
  mousedownNode = null;
}

function getRadius(d) {
  if (d.type === "main") return R_MAIN;
  if (d.type === "activator") return R_STAB_ACTIVATOR;
  if (d.type.includes("connector")) return R_STAB_CONNECTOR;
  if (d.type === "path_white") return R_STAB_PATH;
  if (d.type === "leaf_black") return R_STAB_LEAF;
  if (d.type.includes("dummy")) return R_DUMMY;
  return 10;
}

function getStrokeWidth(d) {
  if (d.type === "main") return 3;
  return 2;
}

function getColor(d) {
  let opinion = nodeOpinions[d.id];
  if (opinion === undefined) opinion = 0;
  return opinion === 1 ? "black" : "white";
}

function getLabelText(d) {
  if (d.type === "main") return d.name;
  if (d.type === "activator") return d.name + "*";
  return "";
}

function getLinkKey(s, t) {
    let sId = (typeof s === 'object') ? s.id : s;
    let tId = (typeof t === 'object') ? t.id : t;
    return [sId, tId].sort().join("|");
}

function addLinkIfAllowed(sourceId, targetId, manual = false) {
    let key = getLinkKey(sourceId, targetId);
    if (!deletedLinks.has(key)) {
        links.push({ source: sourceId, target: targetId, manual: manual });
        return true;
    }
    return false;
}

function removeNode(d) {
    delete fixedPositions[d.id];
    if (d.type === "main") {
        nodes = nodes.filter(n => n.id !== d.id);
        links = links.filter(l => {
            let s = (typeof l.source === 'object') ? l.source.id : l.source;
            let t = (typeof l.target === 'object') ? l.target.id : l.target;
            return s !== d.id && t !== d.id;
        });
        delete nodeOpinions[d.id];
        delete dummyValues[d.id];
        renderDummyInputs();
    } else {
        deletedNodes.add(d.id);
        nodes = nodes.filter(n => n.id !== d.id);
        links = links.filter(l => {
            let s = (typeof l.source === 'object') ? l.source.id : l.source;
            let t = (typeof l.target === 'object') ? l.target.id : l.target;
            return s !== d.id && t !== d.id;
        });
        delete nodeOpinions[d.id];
    }
    // Bereinige deletedLinks
    deletedLinks.forEach(key => {
        let parts = key.split("|");
        if (parts[0] === d.id || parts[1] === d.id) deletedLinks.delete(key);
    });
    updateGadgets();
    restart();
}

function addToUpdateSequence(d) {
    let input = $("#update-sequence");
    let val = input.val().trim();
    let seq = [];
    try {
        seq = JSON.parse(val);
    } catch(e) {
        seq = [];
    }
    let item = (d.type === "main") ? d.name : d.id;
    if (!seq.includes(item)) {
        seq.push(item);
    }
    input.val(JSON.stringify(seq));
}

function dragstarted(d) {
    if (!d3.event.sourceEvent.shiftKey) return;
    currentDraggedNode = d;
    if (!d3.event.active) force.alphaTarget(0.3).restart();
    if (d.type === "main") {
        d.fx = Math.round(d.x / GRID_SIZE) * GRID_SIZE;
        d.fy = Math.round(d.y / GRID_SIZE) * GRID_SIZE;
    } else {
        d.fx = d.x;
        d.fy = d.y;
    }
}

function dragged(d) {
    if (!d3.event.sourceEvent.shiftKey) return;
    if (d.type === "main") {
        d.fx = Math.round(d3.event.x / GRID_SIZE) * GRID_SIZE;
        d.fy = Math.round(d3.event.y / GRID_SIZE) * GRID_SIZE;
    } else {
        d.fx = d3.event.x;
        d.fy = d3.event.y;
    }
}

function dragended(d) {
    currentDraggedNode = null;
    if (!d3.event.sourceEvent.shiftKey) return;
    if (!d3.event.active) force.alphaTarget(0);
    // Position dauerhaft fixieren
    fixedPositions[d.id] = { fx: d.fx, fy: d.fy };
}

function getGadgetAngle(vId) {
  let vNode = nodes.find(n => n.id === vId);
  if (!vNode) return -Math.PI / 2;

  // Bestimme einen Standard-Sektor (oben/unten alternierend)
  let mainNodes = nodes.filter(n => n.type === "main");
  let mIdx = mainNodes.indexOf(vNode);
  let defaultSide = (mIdx % 2 === 0) ? -1 : 1; // -1 ist oben, 1 ist unten

  let mainNeighbors = links.filter(l => {
      let sId = (typeof l.source === 'object') ? l.source.id : l.source;
      let tId = (typeof l.target === 'object') ? l.target.id : l.target;
      return (sId === vId || tId === vId);
  }).map(l => {
      let sId = (typeof l.source === 'object') ? l.source.id : l.source;
      let tId = (typeof l.target === 'object') ? l.target.id : l.target;
      let otherId = (sId === vId) ? tId : sId;
      return nodes.find(n => n.id === otherId && n.type === "main");
  }).filter(n => n !== undefined);

  if (mainNeighbors.length === 0) return defaultSide * Math.PI / 2;

  let sumX = 0;
  let sumY = 0;
  mainNeighbors.forEach(n => {
      let dx = n.x - vNode.x;
      let dy = n.y - vNode.y;
      let dist = Math.sqrt(dx*dx + dy*dy);
      if (dist > 1e-6) {
          sumX += dx / dist;
          sumY += dy / dist;
      }
  });

  if (Math.abs(sumX) < 0.001 && Math.abs(sumY) < 0.001) return defaultSide * Math.PI / 2;

  let tx = -sumX;
  let ty = -sumY;

  // Verstärke die vertikale Komponente deutlich, um "ober/unterhalb" zu erzwingen
  if (Math.abs(ty) < 0.1) {
      ty = defaultSide;
  }
  
  // Erzwinge vertikale Achse für maximale Ordnung
  return Math.atan2(ty, 0);
}

function tick() {
  edgesGroup.selectAll(".edge")
    .attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x)
    .attr("y2", d => d.target.y);

  verticesGroup.selectAll(".vertex")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y);

  labelsGroup.selectAll(".main-label")
    .attr("x", d => d.x)
    .attr("y", d => d.y + 8);

  labelsGroup.selectAll(".activator-label")
    .attr("x", d => d.x)
    .attr("y", d => d.y + 7);
}

function restart() {
  // Edges
  var edges = edgesGroup.selectAll(".edge").data(links);
  edges.exit().remove();
  edges = edges.enter()
    .append("line")
    .attr("class", "edge")
    .merge(edges);

  // Vertices
  var verticesSelection = verticesGroup.selectAll(".vertex").data(nodes, d => d.id);
  verticesSelection.exit().remove();
  
  var verticesEnter = verticesSelection.enter()
    .append("circle")
    .attr("class", "vertex");

  var vertices = verticesEnter.merge(verticesSelection);

  vertices
    .call(d3.drag()
        .filter(() => d3.event.shiftKey)
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
    )
    .on("mouseover", function(d) {
      hoveredNode = d;
    })
    .on("mouseout", function(d) {
      hoveredNode = null;
    })
    .on("mousedown", function(d) {
      if (d3.event.ctrlKey) {
          removeNode(d);
          return;
      }
      if (d3.event.altKey) {
          addToUpdateSequence(d);
          return;
      }
      if (d3.event.shiftKey) return;
      
      mousedownNode = d;
      dragLine
        .classed("hidden", false)
        .attr("d", "M" + mousedownNode.x + "," + mousedownNode.y + "L" + mousedownNode.x + "," + mousedownNode.y);
      
      d3.event.stopPropagation();
    })
    .on("mouseup", function(d) {
      if (!mousedownNode) return;
      dragLine.classed("hidden", true);
      mouseupNode = d;
      
      if (mouseupNode === mousedownNode) {
        if (d3.event.ctrlKey) {
            removeNode(d);
        } else if (d3.event.altKey) {
            addToUpdateSequence(d);
        } else {
            // Toggle opinion
            nodeOpinions[d.id] = nodeOpinions[d.id] === 1 ? 0 : 1;
            restart();
        }
        mousedownNode = null;
        return;
      }

      // Add or Remove link (any node to any node)
      let sourceId = mousedownNode.id;
      let targetId = mouseupNode.id;
      let linkKey = getLinkKey(sourceId, targetId);

      let existingIndex = links.findIndex(l => {
          let s = typeof l.source === 'object' ? l.source.id : l.source;
          let t = typeof l.target === 'object' ? l.target.id : l.target;
          return (s === sourceId && t === targetId) || (s === targetId && t === sourceId);
      });

      if (existingIndex !== -1) {
          // Remove link
          links.splice(existingIndex, 1);
          deletedLinks.add(linkKey);
      } else {
          // Add link
          let isManual = !(mousedownNode.type === "main" && mouseupNode.type === "main");
          links.push({ source: sourceId, target: targetId, manual: isManual });
          deletedLinks.delete(linkKey); // Re-allow if previously deleted
      }

      updateGadgets();
      restart();
      mousedownNode = null;
    })
    .attr("fill", d => getColor(d))
    .attr("r", d => getRadius(d))
    .attr("stroke-width", d => getStrokeWidth(d));

  // Labels
  var mainLabels = labelsGroup.selectAll(".main-label")
    .data(nodes.filter(d => d.type === "main"), d => d.id);
  mainLabels.exit().remove();
  mainLabels.enter()
    .append("text")
    .attr("class", "main-label")
    .attr("text-anchor", "middle")
    .merge(mainLabels)
    .text(d => getLabelText(d));

  var activatorLabels = labelsGroup.selectAll(".activator-label")
    .data(nodes.filter(d => d.type === "activator"), d => d.id);
  activatorLabels.exit().remove();
  activatorLabels.enter()
    .append("text")
    .attr("class", "activator-label")
    .attr("text-anchor", "middle")
    .merge(activatorLabels)
    .text(d => getLabelText(d));

  force.nodes(nodes);
  force.force("link").links(links);
  force.alpha(0.3).restart();
}

function addNode() {
  if (d3.event.target !== svg.node()) return;
  var coords = d3.mouse(svg.node());
  var typeVal = d3.select('input[name="node-type"]:checked').node().value;
  var name = "";
  var id = "";
  var type = "";
  var isManual = false;

  if (typeVal === "main") {
      name = String.fromCharCode(65 + mainNodeCount++);
      id = "main_" + name;
      type = "main";
  } else {
      isManual = true;
      if (typeVal === "activator") {
          name = "v";
          id = "manual_activator_" + manualNodeCount++;
          type = "activator";
      } else if (typeVal === "connector") {
          id = "manual_connector_" + manualNodeCount++;
          type = "connector_white";
      } else if (typeVal === "dummy") {
          id = "manual_dummy_" + manualNodeCount++;
          type = "dummy_white";
      }
  }

  var newNode = {
    id: id,
    name: name,
    type: type,
    manual: isManual,
    x: Math.round(coords[0] / GRID_SIZE) * GRID_SIZE,
    y: Math.round(coords[1] / GRID_SIZE) * GRID_SIZE
  };
  nodes.push(newNode);
  nodeOpinions[newNode.id] = 0;
  if (type === "main") {
      dummyValues[newNode.id] = 0;
      renderDummyInputs();
  }
  updateGadgets();
  restart();
}

function renderDummyInputs() {
    let container = $("#dummy-node-inputs");
    container.empty();
    
    let mainNodes = nodes.filter(n => n.type === "main");
    mainNodes.forEach(n => {
        let div = $("<div class='form-group' style='margin-bottom: 5px; display: flex; align-items: center;'></div>");
        div.append(`<label style='width: 30px; margin-bottom: 0;'>${n.name}:</label>`);
        let input = $(`<input type='number' class='form-control' style='width: 60px; height: 24px; padding: 2px 5px;' value='${dummyValues[n.id] || 0}'>`);
        
        input.on("change", function() {
            dummyValues[n.id] = parseInt($(this).val()) || 0;
            updateGadgets();
            restart();
        });
        
        div.append(input);
        container.append(div);
    });
}

function updateGadgets() {
  const useStabilizers = $("#use-stabilizer-gadgets").is(":checked");
  const useDummies = $("#use-dummy-nodes").is(":checked");

  // Zeige/Verstecke Dummy-Einstellungen
  if (useDummies) {
      $("#dummy-settings").removeClass("hidden");
  } else {
      $("#dummy-settings").addClass("hidden");
  }

  // Behalte Hauptknoten, manuelle Knoten und deren Links
  let mainNodes = nodes.filter(d => d.type === "main");
  let manualNodes = nodes.filter(d => d.manual);
  
  let mainLinks = links.filter(l => {
      let s = (typeof l.source === 'object') ? l.source : nodes.find(n => n.id === l.source);
      let t = (typeof l.target === 'object') ? l.target : nodes.find(n => n.id === l.target);
      if (!s || !t) return false;
      
      // Link ist zwischen zwei Hauptknoten (Standard-Logik)
      if (s.type === "main" && t.type === "main") return true;
      // Link ist manuell erstellt
      if (l.manual) return true;
      
      return false;
  }).map(l => {
      return {
          source: (typeof l.source === 'object') ? l.source.id : l.source,
          target: (typeof l.target === 'object') ? l.target.id : l.target,
          manual: l.manual
      };
  });

  nodes = mainNodes.concat(manualNodes);
  links = mainLinks;
  
  // 1. Dummies hinzufügen (muss vor Stabilizern passieren)
  if (useDummies) {
      mainNodes.forEach(v => {
          let y = dummyValues[v.id] || 0;
          if (y > 0) {
              // 2y weiße Dummies
              for(let i=1; i <= 2 * y; i++) {
                  let dummyId = `dw(${v.name},${i})`;
                  if (deletedNodes.has(dummyId)) continue;
                  const gAngle = getGadgetAngle(v.id);
                  let angle = gAngle + Math.PI + (i - (2 * y + 1) / 2) * (Math.PI / (2 * y + 1));
                  let dummyNode = { 
                      id: dummyId, 
                      type: "dummy_white", 
                      x: v.x + Math.cos(angle) * 50, 
                      y: v.y + Math.sin(angle) * 50 
                  };
                  nodes.push(dummyNode);
                  if (nodeOpinions[dummyId] === undefined) nodeOpinions[dummyId] = 0;
                  addLinkIfAllowed(v.id, dummyId);
              }
          } else if (y < 0) {
              // -2y schwarze Dummy-Paare
              for(let i=1; i <= -2 * y; i++) {
                  let d1Id = `db(${v.name},${i},1)`;
                  let d2Id = `db(${v.name},${i},2)`;
                  if (deletedNodes.has(d1Id) || deletedNodes.has(d2Id)) continue;
                  const gAngle = getGadgetAngle(v.id);
                  let angle = gAngle + Math.PI + (i - (-2 * y + 1) / 2) * (Math.PI / (-2 * y + 1));
                  let d1Node = { 
                      id: d1Id, 
                      type: "dummy_black", 
                      x: v.x + Math.cos(angle) * 50, 
                      y: v.y + Math.sin(angle) * 50 
                  };
                  let d2Node = { 
                      id: d2Id, 
                      type: "dummy_black", 
                      x: v.x + Math.cos(angle) * 80, 
                      y: v.y + Math.sin(angle) * 80 
                  };
                  nodes.push(d1Node, d2Node);
                  if (nodeOpinions[d1Id] === undefined) nodeOpinions[d1Id] = 1;
                  if (nodeOpinions[d2Id] === undefined) nodeOpinions[d2Id] = 1;
                  addLinkIfAllowed(v.id, d1Id);
                  addLinkIfAllowed(d1Id, d2Id);
              }
          }
      });
  }

  // 2. Stabilizer Gadgets hinzufügen
  if (useStabilizers) {
      mainNodes.forEach(v => {
          // Grad inkl. Dummies
          let neighbors = links.filter(l => {
              let s = (typeof l.source === 'object') ? l.source.id : l.source;
              let t = (typeof l.target === 'object') ? l.target.id : l.target;
              return s === v.id || t === v.id;
          });
          let deg_v = neighbors.length;

          const angle = getGadgetAngle(v.id);
          const perpAngle = angle + Math.PI / 2;

          let activatorId = `sa(${v.name})`;
          const activatorDist = 200 + deg_v * 60;
          if (!deletedNodes.has(activatorId)) {
              let activatorNode = { 
                  id: activatorId, 
                  name: v.name, 
                  type: "activator", 
                  x: v.x + Math.cos(angle) * activatorDist, 
                  y: v.y + Math.sin(angle) * activatorDist 
              };
              nodes.push(activatorNode);
              if (nodeOpinions[activatorId] === undefined) nodeOpinions[activatorId] = 0;
          }

          const totalConnectors = deg_v * 2;
          for (let i = 1; i <= deg_v; i++) {
              let wcId = `swc(${v.name},${i})`;
              let bcId = `sbc(${v.name},${i})`;
              
              let wcOffset = (i - (totalConnectors + 1) / 2) * 60;
              let bcOffset = (i + deg_v - (totalConnectors + 1) / 2) * 60;

              if (!deletedNodes.has(wcId)) {
                let wcNode = { 
                    id: wcId, 
                    type: "connector_white", 
                    x: v.x + Math.cos(angle) * (activatorDist / 2) + wcOffset, 
                    y: v.y + Math.sin(angle) * (activatorDist / 2) 
                };
                nodes.push(wcNode);
                if (nodeOpinions[wcId] === undefined) nodeOpinions[wcId] = 0;
                addLinkIfAllowed(v.id, wcId);
                if (!deletedNodes.has(activatorId)) addLinkIfAllowed(activatorId, wcId);

                // White path
                let p1Id = `swp(${v.name},${i},1)`;
                let p2Id = `swp(${v.name},${i},2)`;
                if (!deletedNodes.has(p1Id) && !deletedNodes.has(p2Id)) {
                    let p1Node = { id: p1Id, type: "path_white", 
                        x: wcNode.x, 
                        y: wcNode.y - 45 
                    };
                    let p2Node = { id: p2Id, type: "path_white", 
                        x: wcNode.x, 
                        y: wcNode.y - 90 
                    };
                    nodes.push(p1Node, p2Node);
                    if (nodeOpinions[p1Id] === undefined) nodeOpinions[p1Id] = 1;
                    if (nodeOpinions[p2Id] === undefined) nodeOpinions[p2Id] = 1;
                    addLinkIfAllowed(wcId, p1Id);
                    addLinkIfAllowed(p1Id, p2Id);
                }
              }

              if (!deletedNodes.has(bcId)) {
                let bcNode = { 
                    id: bcId, 
                    type: "connector_black", 
                    x: v.x + Math.cos(angle) * (activatorDist / 2) + bcOffset, 
                    y: v.y + Math.sin(angle) * (activatorDist / 2) 
                };
                nodes.push(bcNode);
                if (nodeOpinions[bcId] === undefined) nodeOpinions[bcId] = 1;
                addLinkIfAllowed(v.id, bcId);
                if (!deletedNodes.has(activatorId)) addLinkIfAllowed(activatorId, bcId);

                // Black leaves
                for(let j=1; j<=2; j++) {
                    let leafId = `sbl(${v.name},${i},${j})`;
                    if (deletedNodes.has(leafId)) continue;
                    let leafXOffset = (j === 1 ? -25 : 25);
                    let leafNode = { id: leafId, type: "leaf_black", 
                        x: bcNode.x + leafXOffset, 
                        y: bcNode.y + 40 
                    };
                    nodes.push(leafNode);
                    if (nodeOpinions[leafId] === undefined) nodeOpinions[leafId] = 1;
                    addLinkIfAllowed(bcId, leafId);
                }
              }
          }
      });
  }
  
  // Fixierte Positionen anwenden
  nodes.forEach(n => {
    if (fixedPositions[n.id]) {
      n.fx = fixedPositions[n.id].fx;
      n.fy = fixedPositions[n.id].fy;
    }
  });
}

// UI Handlers
$("#use-stabilizer-gadgets, #use-dummy-nodes").on("change", function() {
    updateGadgets();
    restart();
});

$("#clear-graph").on("click", function() {
    nodes = [];
    links = [];
    nodeOpinions = {};
    dummyValues = {};
    fixedPositions = {};
    deletedNodes = new Set();
    deletedLinks = new Set();
    mainNodeCount = 0;
    renderDummyInputs();
    restart();
});

function alignConnectors(activator) {
    const vName = activator.name;
    const vNode = nodes.find(n => n.name === vName && n.type === "main");
    if (!vNode) return;

    // Aktivator bleibt an Mausposition
    activator.fx = activator.x;
    activator.fy = activator.y;
    fixedPositions[activator.id] = { fx: activator.fx, fy: activator.fy };

    // Finde alle zugehörigen Verbindungsknoten
    const connectors = nodes.filter(n => 
        n.id.startsWith("swc(" + vName + ",") || n.id.startsWith("sbc(" + vName + ",")
    );

    if (connectors.length === 0) return;

    // Sortierung: Weiße Connectoren zuerst, dann schwarze, jeweils nach Index
    connectors.sort((a, b) => {
        let typeA = a.id.startsWith("swc") ? 0 : 1;
        let typeB = b.id.startsWith("swc") ? 0 : 1;
        if (typeA !== typeB) return typeA - typeB;
        let idxA = parseInt(a.id.match(/,(\d+)\)/)[1]);
        let idxB = parseInt(b.id.match(/,(\d+)\)/)[1]);
        return idxA - idxB;
    });

    const num = connectors.length;
    const spacing = 60; 
    const midX = (vNode.x + activator.x) / 2;
    const midY = (vNode.y + activator.y) / 2;
    const totalWidth = (num - 1) * spacing;
    const firstX = midX - totalWidth / 2;

    connectors.forEach((c, i) => {
        c.fx = firstX + i * spacing;
        c.fy = midY; // Auf horizontaler Linie in der Y-Mitte
        c.x = c.fx;
        c.y = c.fy;
        fixedPositions[c.id] = { fx: c.fx, fy: c.fy };
    });

    force.alpha(0.1).restart();
    restart();
}

function orientSubNodes(connector) {
    const match = connector.id.match(/\(([^,]+),(\d+)\)/);
    if (!match) return;
    const vName = match[1];
    const index = match[2];
    const vNode = nodes.find(n => n.name === vName && n.type === "main");
    if (!vNode) return;

    // Finde Aktivator
    const activatorId = `sa(${vName})`;
    const activator = nodes.find(n => n.id === activatorId);

    // Vektor weg vom Hauptknoten
    const dxV = connector.x - vNode.x;
    const dyV = connector.y - vNode.y;
    const distV = Math.sqrt(dxV * dxV + dyV * dyV);
    const uvx = dxV / distV;
    const uvy = dyV / distV;

    // Vektor weg vom Aktivator
    let uax = 0, uay = 0;
    if (activator) {
        const dxA = connector.x - activator.x;
        const dyA = connector.y - activator.y;
        const distA = Math.sqrt(dxA * dxA + dyA * dyA);
        if (distA > 0) {
            uax = dxA / distA;
            uay = dyA / distA;
        }
    }

    // Winkelhalbierende für die allgemeine Gadget-Orientierung (freie Region)
    let bx = uvx + uax;
    let by = uvy + uay;
    let bLen = Math.sqrt(bx * bx + by * by);
    if (bLen < 0.01) {
        bx = -uvy; by = uvx; // Senkrechte falls fast auf einer Linie
    } else {
        bx /= bLen; by /= bLen;
    }

    if (connector.type === "connector_white") {
        // Weiße Kette: p1 hängt an connector, p2 an p1.
        // Soll parallel zur Kante vNode-connector verlaufen (leicht daneben).
        
        // Normale zur Kante vNode-connector, die in die freie Region (b) zeigt
        let nx = -uvy;
        let ny = uvx;
        if (nx * bx + ny * by < 0) {
            nx = -nx;
            ny = -ny;
        }

        const offset = 35;
        const step = 45;

        for (let j = 1; j <= 2; j++) {
            const pId = `swp(${vName},${index},${j})`;
            const pNode = nodes.find(n => n.id === pId);
            if (pNode) {
                if (j === 1) {
                    // p1 ist der Aufhänger, leicht zur Seite versetzt
                    pNode.fx = connector.x + nx * offset;
                    pNode.fy = connector.y + ny * offset;
                } else {
                    // p2 setzt die Kette parallel zur Hauptkante fort
                    pNode.fx = connector.x + nx * offset + uvx * step;
                    pNode.fy = connector.y + ny * offset + uvy * step;
                }
                pNode.x = pNode.fx;
                pNode.y = pNode.fy;
                fixedPositions[pId] = { fx: pNode.fx, fy: pNode.fy };
            }
        }
    } else if (connector.type === "connector_black") {
        // Schwarze Blätter: Orientierung in die freie Region (bx, by)
        const angle = Math.atan2(by, bx);
        const spread = 0.4;
        for (let j = 1; j <= 2; j++) {
            const lId = `sbl(${vName},${index},${j})`;
            const lNode = nodes.find(n => n.id === lId);
            if (lNode) {
                const leafAngle = angle + (j === 1 ? -spread : spread);
                const leafDist = 45;
                lNode.fx = connector.x + Math.cos(leafAngle) * leafDist;
                lNode.fy = connector.y + Math.sin(leafAngle) * leafDist;
                lNode.x = lNode.fx;
                lNode.y = lNode.fy;
                fixedPositions[lId] = { fx: lNode.fx, fy: lNode.fy };
            }
        }
    }
    force.alpha(0.05).restart();
    restart();
}

function alignDummies(mainNode) {
    const v = mainNode;
    const y = dummyValues[v.id] || 0;
    if (y === 0) return;

    const gAngle = getGadgetAngle(v.id);
    const baseAngle = gAngle + Math.PI;

    if (y > 0) {
        // 2y weiße Dummies
        for (let i = 1; i <= 2 * y; i++) {
            let dummyId = `dw(${v.name},${i})`;
            let dummyNode = nodes.find(n => n.id === dummyId);
            if (dummyNode) {
                let angle = baseAngle + (i - (2 * y + 1) / 2) * (Math.PI / (2 * y + 1));
                dummyNode.fx = v.x + Math.cos(angle) * 70;
                dummyNode.fy = v.y + Math.sin(angle) * 70;
                dummyNode.x = dummyNode.fx;
                dummyNode.y = dummyNode.fy;
                fixedPositions[dummyId] = { fx: dummyNode.fx, fy: dummyNode.fy };
            }
        }
    } else if (y < 0) {
        // -2y schwarze Dummy-Paare
        for (let i = 1; i <= -2 * y; i++) {
            let d1Id = `db(${v.name},${i},1)`;
            let d2Id = `db(${v.name},${i},2)`;
            let d1Node = nodes.find(n => n.id === d1Id);
            let d2Node = nodes.find(n => n.id === d2Id);
            let angle = baseAngle + (i - (-2 * y + 1) / 2) * (Math.PI / (-2 * y + 1));
            
            if (d1Node) {
                d1Node.fx = v.x + Math.cos(angle) * 70;
                d1Node.fy = v.y + Math.sin(angle) * 70;
                d1Node.x = d1Node.fx;
                d1Node.y = d1Node.fy;
                fixedPositions[d1Id] = { fx: d1Node.fx, fy: d1Node.fy };
            }
            if (d2Node) {
                d2Node.fx = v.x + Math.cos(angle) * 110;
                d2Node.fy = v.y + Math.sin(angle) * 110;
                d2Node.x = d2Node.fx;
                d2Node.y = d2Node.fy;
                fixedPositions[d2Id] = { fx: d2Node.fx, fy: d2Node.fy };
            }
        }
    }
}

function optimizeMainNode(mainNode) {
    // Snap Hauptknoten ans Grid
    mainNode.x = Math.round(mainNode.x / GRID_SIZE) * GRID_SIZE;
    mainNode.y = Math.round(mainNode.y / GRID_SIZE) * GRID_SIZE;
    mainNode.fx = mainNode.x;
    mainNode.fy = mainNode.y;
    fixedPositions[mainNode.id] = { fx: mainNode.fx, fy: mainNode.fy };

    const vName = mainNode.name;
    const activatorId = `sa(${vName})`;
    const activator = nodes.find(n => n.id === activatorId);
    
    // 1. Aktivator-Position bestimmen (erzwungene vertikale Achse)
    if (activator) {
        const connectorsCount = nodes.filter(n => n.id.startsWith("swc(" + vName + ",") || n.id.startsWith("sbc(" + vName + ",")).length;
        const gAngle = getGadgetAngle(mainNode.id);
        const activatorDist = 200 + connectorsCount * 60;
        
        // Initiale Position (erzwungen auf vertikaler Achse)
        let side = (Math.sin(gAngle) >= 0) ? 1 : -1;
        let targetX = mainNode.x;
        let targetY = mainNode.y + side * activatorDist;
        
        // 15% Annäherung (Distanzstraffung)
        activator.fx = mainNode.x;
        activator.fy = mainNode.y + (targetY - mainNode.y) * 0.85;
        activator.x = activator.fx;
        activator.y = activator.fy;
        fixedPositions[activatorId] = { fx: activator.fx, fy: activator.fy };
    }

    // 2. Connectoren ausrichten (zwischen Hauptknoten und NEUEM Aktivator-Standort)
    if (activator) {
        alignConnectors(activator);
    }

    // 3. Unterstrukturen orientieren
    const connectors = nodes.filter(n => n.id.startsWith("swc(" + vName + ",") || n.id.startsWith("sbc(" + vName + ","));
    // Von links nach rechts sortieren basierend auf X-Koordinate
    connectors.sort((a, b) => a.x - b.x);
    connectors.forEach(c => orientSubNodes(c));

    // 4. Dummies ausrichten
    alignDummies(mainNode);
}

// Tastatursteuerung
$(document).on("keydown", function(e) {
    if (e.key === "t" || e.key === "T") {
        if (currentDraggedNode && currentDraggedNode.type === "activator") {
            alignConnectors(currentDraggedNode);
        }
    }
    if (e.key === "r" || e.key === "R") {
        if (hoveredNode && hoveredNode.type === "main") {
            optimizeMainNode(hoveredNode);
            force.alpha(0.05).restart();
            restart();
        }
    }
    if (e.key === "o" || e.key === "O") {
        nodes.filter(n => n.type === "main").forEach(mainNode => {
            optimizeMainNode(mainNode);
        });
        force.alpha(0.05).restart();
        restart();
    }
});

$(document).on("keyup", function(e) {
    if (e.key === " " || e.key === "Enter") {
        if (!$("#next-step").prop("disabled")) {
            $("#next-step").click();
            e.preventDefault();
        }
    }
});

var currentSequence = [];
var currentStep = 0;

$("#start-sequence").on("click", function() {
    try {
        let inputVal = $("#update-sequence").val().trim();
        // Erlaube ["A", "B", "C"] oder [["A"], ["B"], ["C"]]
        let rawSeq = JSON.parse(inputVal);
        currentSequence = rawSeq.map(step => Array.isArray(step) ? step : [step]);
        currentStep = 0;
        $("#next-step").prop("disabled", false);
        $("#next-step").text("Nächster Schritt");
        $("#step-info").html("<strong>Sequenz gestartet.</strong> Schritt " + (currentStep + 1) + " bereit.");
    } catch(e) {
        alert("Ungültige Sequenz! Bitte geben Sie ein JSON-Array ein, z.B. [\"A\", \"B\"] oder [[\"A\"], [\"B\"]]");
    }
});

$("#next-step").on("click", function() {
    if (currentStep >= currentSequence.length) {
        $("#step-info").html("<strong>Sequenz beendet.</strong>");
        $(this).prop("disabled", true);
        return;
    }

    let nodeNamesToUpdate = currentSequence[currentStep];
    let nodesToUpdate = nodes.filter(n => (n.type === "main" && nodeNamesToUpdate.includes(n.name)) || nodeNamesToUpdate.includes(n.id));
    
    if (nodesToUpdate.length > 0) {
        performUpdateStep(nodesToUpdate.map(n => n.id));
        $("#step-info").html("Update für Knoten <strong>" + nodeNamesToUpdate.join(", ") + "</strong> durchgeführt.");
        currentStep++;
        if (currentStep >= currentSequence.length) {
            $("#next-step").text("Beenden");
        } else {
            $("#step-info").append("<br>Nächster Schritt: " + (currentStep + 1));
        }
    } else {
        $("#step-info").html("Knoten <strong>" + nodeNamesToUpdate.join(", ") + "</strong> nicht gefunden.");
        currentStep++;
    }
    
    restart();
});

function performUpdateStep(nodeIds) {
    let currentOpinions = Object.assign({}, nodeOpinions);
    
    nodeIds.forEach(nodeId => {
        let neighbors = links
            .filter(l => {
                let s = (typeof l.source === 'object') ? l.source.id : l.source;
                let t = (typeof l.target === 'object') ? l.target.id : l.target;
                return s === nodeId || t === nodeId;
            })
            .map(l => {
                let s = (typeof l.source === 'object') ? l.source.id : l.source;
                let t = (typeof l.target === 'object') ? l.target.id : l.target;
                return s === nodeId ? t : s;
            });
        
        let c0 = 0;
        let c1 = 0;
        
        neighbors.forEach(nbId => {
            if (currentOpinions[nbId] === 1) c1++;
            else c0++;
        });
        
        if (c1 > c0) nodeOpinions[nodeId] = 1;
        else if (c0 > c1) nodeOpinions[nodeId] = 0;
        // Bei Gleichstand keine Änderung
    });
}

$("#export-image").on("click", function() {
    saveSvgAsPng(svg.node(), "infnet-graph.png");
});

function saveSvgAsPng(svgNode, filename) {
    // Klonen des SVG-Nodes, um das Original nicht zu verändern
    var svgClone = svgNode.cloneNode(true);
    
    // Grid entfernen, falls vorhanden
    var gridToRemove = svgClone.querySelector(".grid-group");
    if (gridToRemove) gridToRemove.remove();
    
    // Einfügen der Styles direkt in den Klon
    var styleElement = document.createElementNS("http://www.w3.org/2000/svg", "style");
    styleElement.textContent = `
        .vertex { stroke: #000; stroke-width: 2px; }
        .edge { stroke: #000; stroke-width: 2px; }
        .main-label { font-family: sans-serif; font-size: 20px; fill: #6a6af4; }
        .activator-label { font-family: sans-serif; font-size: 18px; fill: #000; }
    `;
    svgClone.insertBefore(styleElement, svgClone.firstChild);

    var svgData = new XMLSerializer().serializeToString(svgClone);
    var canvas = document.createElement("canvas");
    
    // Verwende die tatsächliche Größe des SVGs
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    var img = document.createElement("img");
    
    // Verwende btoa nur mit validen Zeichen
    var svgBlob = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'});
    var url = URL.createObjectURL(svgBlob);

    img.onload = function() {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        var canvasdata = canvas.toDataURL("image/png");
        var a = document.createElement("a");
        a.download = filename;
        a.href = canvasdata;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    img.src = url;
}

restart();
