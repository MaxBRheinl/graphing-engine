"use strict";

var nodes = [];
var links = [];
var nodeStates = {}; // id -> 0 (weiß) oder 1 (rot)
var nodeThresholds = {}; // id -> thr
var fixedPositions = {}; // id -> {fx, fy}
var mainNodeCount = 0;
var GRID_SIZE = 50;

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
  .force("charge", d3.forceManyBody().strength(-500).distanceMax(w / 2))
  .force("link", d3.forceLink().id(d => d.id).distance(150))
  .force("x", d3.forceX(w / 2).strength(0.05))
  .force("y", d3.forceY(h / 2).strength(0.05))
  .force("collide", d3.forceCollide().radius(45).iterations(2))
  .on("tick", tick);

var mousedownNode = null;
var mouseupNode = null;

function drawGrid() {
  gridGroup.selectAll("*").remove();
  for (let x = 0; x <= w; x += GRID_SIZE) {
    gridGroup.append("line")
      .attr("x1", x).attr("y1", 0)
      .attr("x2", x).attr("y2", h);
  }
  for (let y = 0; y <= h; y += GRID_SIZE) {
    gridGroup.append("line")
      .attr("x1", 0).attr("y1", y)
      .attr("x2", w).attr("y2", y);
  }
}
drawGrid();

const R_MAIN = 35;

function getRadius(d) {
  return R_MAIN;
}

function getLinkKey(s, t) {
    let sId = (typeof s === 'object') ? s.id : s;
    let tId = (typeof t === 'object') ? t.id : t;
    return [sId, tId].sort().join("|");
}

function getColor(d) {
  return nodeStates[d.id] === 1 ? "#ff4d4d" : "white";
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

  labelsGroup.selectAll(".label-container")
    .attr("transform", d => `translate(${d.x},${d.y})`);
}

function restart() {
  // Links
  var edge = edgesGroup.selectAll(".edge").data(links, d => getLinkKey(d.source, d.target));
  edge.exit().remove();
  edge = edge.enter()
    .append("line")
    .attr("class", "edge")
    .merge(edge);

  // Vertices
  var vertex = verticesGroup.selectAll(".vertex").data(nodes, d => d.id);
  vertex.exit().remove();
  vertex = vertex.enter()
    .append("circle")
    .attr("class", "vertex")
    .attr("r", getRadius)
    .on("mousedown", d => {
      if (d3.event.ctrlKey) {
        removeNode(d);
        return;
      }
      if (d3.event.altKey) {
        nodeStates[d.id] = nodeStates[d.id] === 1 ? 0 : 1;
        updateStepInfo();
        restart();
        return;
      }
      if (d3.event.shiftKey) return;
      
      mousedownNode = d;
      dragLine
        .classed("hidden", false)
        .attr("d", `M${mousedownNode.x},${mousedownNode.y}L${mousedownNode.x},${mousedownNode.y}`);
      
      d3.event.stopPropagation();
    })
    .on("mouseup", d => {
      if (!mousedownNode) return;
      dragLine.classed("hidden", true);
      mouseupNode = d;
      
      if (mouseupNode === mousedownNode) {
        // Toggle state if it was a simple click
        nodeStates[d.id] = nodeStates[d.id] === 1 ? 0 : 1;
        updateStepInfo();
        restart();
        mousedownNode = null;
        return;
      }
      
      // Add or Remove link
      var sourceId = mousedownNode.id;
      var targetId = mouseupNode.id;
      
      let existingIndex = links.findIndex(l => {
          let s = typeof l.source === 'object' ? l.source.id : l.source;
          let t = typeof l.target === 'object' ? l.target.id : l.target;
          return (s === sourceId && t === targetId) || (s === targetId && t === sourceId);
      });

      if (existingIndex !== -1) {
          links.splice(existingIndex, 1);
      } else {
          links.push({ source: sourceId, target: targetId });
      }
      
      restart();
      mousedownNode = null;
    })
    .call(d3.drag()
        .filter(() => d3.event.shiftKey)
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
    )
    .merge(vertex);

  vertex.attr("fill", getColor);

  // Labels
  var labels = labelsGroup.selectAll(".label-container").data(nodes, d => d.id);
  labels.exit().remove();
  
  var labelsEnter = labels.enter()
    .append("g")
    .attr("class", "label-container");

  labelsEnter.append("text")
    .attr("class", "main-label")
    .attr("text-anchor", "middle")
    .attr("dy", "-0.1em");

  labelsEnter.append("text")
    .attr("class", "thr-label")
    .attr("text-anchor", "middle")
    .attr("dy", "1.4em");

  labels = labelsEnter.merge(labels);
  labels.select(".main-label").text(d => d.name);
  labels.select(".thr-label").text(d => `[${nodeThresholds[d.id]}]`);

  force.nodes(nodes);
  force.force("link").links(links);
  force.alpha(0.3).restart();
}

function addNode() {
  if (d3.event.target !== svg.node()) return;
  var coords = d3.mouse(svg.node());
  var name = String.fromCharCode(65 + mainNodeCount++);
  var id = "node_" + name;

  var newNode = {
    id: id,
    name: name,
    x: Math.round(coords[0] / GRID_SIZE) * GRID_SIZE,
    y: Math.round(coords[1] / GRID_SIZE) * GRID_SIZE
  };
  nodes.push(newNode);
  nodeStates[id] = 0;
  nodeThresholds[id] = 1; // Default threshold
  
  updateStepInfo();
  renderThresholdInputs();
  restart();
}

function removeNode(d) {
  nodes = nodes.filter(n => n.id !== d.id);
  links = links.filter(l => l.source.id !== d.id && l.target.id !== d.id);
  delete nodeStates[d.id];
  delete nodeThresholds[d.id];
  updateStepInfo();
  renderThresholdInputs();
  restart();
}

function mousemove() {
  if (!mousedownNode) return;
  var coords = d3.mouse(svg.node());
  dragLine.attr("d", `M${mousedownNode.x},${mousedownNode.y}L${coords[0]},${coords[1]}`);
}

function mouseup() {
  mousedownNode = null;
  dragLine.classed("hidden", true);
}

function dragstarted(d) {
  if (!d3.event.sourceEvent.shiftKey) return;
  if (!d3.event.active) force.alphaTarget(0.3).restart();
  d.fx = Math.round(d.x / GRID_SIZE) * GRID_SIZE;
  d.fy = Math.round(d.y / GRID_SIZE) * GRID_SIZE;
}

function dragged(d) {
  if (!d3.event.sourceEvent.shiftKey) return;
  d.fx = Math.round(d3.event.x / GRID_SIZE) * GRID_SIZE;
  d.fy = Math.round(d3.event.y / GRID_SIZE) * GRID_SIZE;
}

function dragended(d) {
  if (!d3.event.active) force.alphaTarget(0);
  fixedPositions[d.id] = { fx: d.fx, fy: d.fy };
}

d3.select(window).on("keydown", function() {
    if (d3.event.key === "o" || d3.event.key === "O") {
        nodes.forEach(n => {
            delete n.fx;
            delete n.fy;
            delete fixedPositions[n.id];
        });
        force.alpha(0.3).restart();
    }
});

function renderThresholdInputs() {
    let container = $("#thr-inputs-container");
    container.empty();
    
    if (nodes.length === 0) {
        container.append('<p class="text-muted">Noch keine Knoten vorhanden.</p>');
        return;
    }

    nodes.forEach(n => {
        let div = $("<div class='form-group' style='margin-bottom: 5px; display: flex; align-items: center;'></div>");
        div.append(`<label style='width: 30px; margin-bottom: 0;'>${n.name}:</label>`);
        let input = $(`<input type='number' min='0' class='form-control' style='width: 60px; height: 24px; padding: 2px 5px;' value='${nodeThresholds[n.id]}'>`);
        
        input.on("change", function() {
            nodeThresholds[n.id] = parseInt($(this).val()) || 0;
            restart();
        });
        
        div.append(input);
        container.append(div);
    });
}

// TSS Logic
function updateStepInfo() {
    let activeCount = nodes.filter(n => nodeStates[n.id] === 1).length;
    $("#step-info").html(`<h4>Status</h4><p>Aktivierte Knoten: ${activeCount} / ${nodes.length}</p>`);
}

function runStep() {
    let newStates = Object.assign({}, nodeStates);
    let changed = false;

    nodes.forEach(v => {
        if (nodeStates[v.id] === 1) return; // Schon aktiviert

        // Zähle aktivierte Nachbarn
        let activeNeighbors = 0;
        links.forEach(l => {
            let sourceId = l.source.id || l.source;
            let targetId = l.target.id || l.target;
            
            if (sourceId === v.id) {
                if (nodeStates[targetId] === 1) activeNeighbors++;
            } else if (targetId === v.id) {
                if (nodeStates[sourceId] === 1) activeNeighbors++;
            }
        });

        if (activeNeighbors >= nodeThresholds[v.id]) {
            newStates[v.id] = 1;
            changed = true;
        }
    });

    nodeStates = newStates;
    updateStepInfo();
    restart();
    return changed;
}

function runUntilStable() {
    let iterations = 0;
    while (runStep() && iterations < 100) {
        iterations++;
    }
}

function resetStates() {
    nodes.forEach(n => {
        nodeStates[n.id] = 0;
    });
    updateStepInfo();
    restart();
}

$("#run-step").click(runStep);
$("#run-until-stable").click(runUntilStable);
$("#reset-states").click(resetStates);
$("#clear-graph").click(() => {
    nodes = [];
    links = [];
    nodeStates = {};
    nodeThresholds = {};
    mainNodeCount = 0;
    updateStepInfo();
    renderThresholdInputs();
    restart();
});

$("#export-image").click(function() {
    saveSvgAsPng(svg.node(), "tss-graph.png");
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
        .main-label { font-family: sans-serif; font-size: 20px; font-weight: bold; fill: #333; }
        .thr-label { font-family: sans-serif; font-size: 14px; fill: #000; }
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

window.addEventListener("resize", () => {
    w = window.innerWidth * 0.75;
    h = window.innerHeight;
    svg.attr("width", w).attr("height", h);
    force.force("x", d3.forceX(w / 2).strength(0.05));
    force.force("y", d3.forceY(h / 2).strength(0.05));
    force.alpha(0.3).restart();
    drawGrid();
});

updateStepInfo();
restart();
