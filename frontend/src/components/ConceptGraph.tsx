import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";

type GraphNode = { id: string };
type GraphLink = { source: string; target: string; label?: string };

type VisualNode = {
  id: string;
  displayLabel: string;
  degree: number;
  group: number;
  color: string;
  neighbors: string[];
  x?: number;
  y?: number;
};

type VisualLink = {
  source: string | VisualNode;
  target: string | VisualNode;
  sourceId: string;
  targetId: string;
  label: string;
  relation: string;
  strengthScore: number;
  isStrong: boolean;
};

const COLOR_PALETTE = [
  "#e45a41",
  "#0f9d90",
  "#3772ff",
  "#b65fcf",
  "#ff8a3d",
  "#4caf50",
  "#f06292",
  "#8d6e63",
];

const STRONG_RELATION_RATIO = 0.4;

function trimLabel(value: string, maxLength = 30) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function endpointId(value: string | VisualNode | undefined | null) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return value.id;
}

function relationText(source: string, label: string, target: string) {
  return `${source} - ${label} -> ${target}`;
}

type ConceptGraphProps = {
  graph?: {
    nodes: GraphNode[];
    links: GraphLink[];
  };
};

export function ConceptGraph({ graph }: ConceptGraphProps) {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<{
    centerAt: (x?: number, y?: number, ms?: number) => void;
    zoom: (k: number, ms?: number) => void;
    zoomToFit: (ms?: number, padding?: number) => void;
  } | null>(null);
  const hasAutoFitRef = useRef(false);
  const [width, setWidth] = useState(680);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredLinkLabel, setHoveredLinkLabel] = useState<string | null>(null);
  const [showStrongOnly, setShowStrongOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) {
      return;
    }

    const resize = () => {
      const nextWidth = Math.max(320, Math.floor(host.clientWidth));
      setWidth(nextWidth);
    };

    resize();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const graphData = useMemo(() => {
    const nodeIds: string[] = [];
    const nodeMap = new Map<string, VisualNode>();
    const adjacency = new Map<string, Set<string>>();
    const relationByNode = new Map<string, Set<string>>();
    const links: VisualLink[] = [];
    const linkFingerprints = new Set<string>();

    for (const rawNode of graph?.nodes ?? []) {
      const id = rawNode.id.replace(/\s+/g, " ").trim();
      if (!id || nodeMap.has(id)) {
        continue;
      }
      nodeIds.push(id);
      adjacency.set(id, new Set<string>());
      relationByNode.set(id, new Set<string>());
      nodeMap.set(id, {
        id,
        displayLabel: trimLabel(id),
        degree: 0,
        group: 0,
        color: COLOR_PALETTE[0],
        neighbors: [],
      });
    }

    for (const rawLink of graph?.links ?? []) {
      const source = rawLink.source.replace(/\s+/g, " ").trim();
      const target = rawLink.target.replace(/\s+/g, " ").trim();
      const label = rawLink.label?.replace(/\s+/g, " ").trim() || "related to";

      if (!source || !target) {
        continue;
      }

      if (!nodeMap.has(source)) {
        nodeIds.push(source);
        adjacency.set(source, new Set<string>());
        relationByNode.set(source, new Set<string>());
        nodeMap.set(source, {
          id: source,
          displayLabel: trimLabel(source),
          degree: 0,
          group: 0,
          color: COLOR_PALETTE[0],
          neighbors: [],
        });
      }

      if (!nodeMap.has(target)) {
        nodeIds.push(target);
        adjacency.set(target, new Set<string>());
        relationByNode.set(target, new Set<string>());
        nodeMap.set(target, {
          id: target,
          displayLabel: trimLabel(target),
          degree: 0,
          group: 0,
          color: COLOR_PALETTE[0],
          neighbors: [],
        });
      }

      adjacency.get(source)?.add(target);
      adjacency.get(target)?.add(source);

      const relation = relationText(source, label, target);
      const fingerprint = `${source}|${label}|${target}`;
      if (linkFingerprints.has(fingerprint)) {
        relationByNode.get(source)?.add(relation);
        relationByNode.get(target)?.add(relation);
        continue;
      }
      linkFingerprints.add(fingerprint);

      relationByNode.get(source)?.add(relation);
      relationByNode.get(target)?.add(relation);

      links.push({
        source,
        target,
        sourceId: source,
        targetId: target,
        label,
        relation,
        strengthScore: 0,
        isStrong: false,
      });
    }

    const visited = new Set<string>();
    let componentCount = 0;

    for (const id of nodeIds) {
      if (visited.has(id)) {
        continue;
      }

      componentCount += 1;
      const queue = [id];
      visited.add(id);
      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) {
          continue;
        }

        const node = nodeMap.get(current);
        if (node) {
          node.group = componentCount - 1;
          node.color = COLOR_PALETTE[node.group % COLOR_PALETTE.length];
        }

        for (const neighbor of adjacency.get(current) ?? []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
    }

    const nodes: VisualNode[] = [];
    for (const id of nodeIds) {
      const node = nodeMap.get(id);
      if (!node) {
        continue;
      }
      node.neighbors = Array.from(adjacency.get(id) ?? []);
      node.degree = node.neighbors.length;
      nodes.push(node);
    }

    for (const link of links) {
      const sourceDegree = nodeMap.get(link.sourceId)?.degree ?? 0;
      const targetDegree = nodeMap.get(link.targetId)?.degree ?? 0;
      const specificityBoost = link.label.toLowerCase() === "related to" ? 0 : 0.35;
      link.strengthScore = sourceDegree + targetDegree + specificityBoost;
    }

    const sortedStrengths = links.map((link) => link.strengthScore).sort((a, b) => b - a);
    const strongRelationCount = links.length > 0 ? Math.max(1, Math.ceil(links.length * STRONG_RELATION_RATIO)) : 0;
    const strongCutoff = strongRelationCount > 0
      ? sortedStrengths[Math.max(0, strongRelationCount - 1)]
      : Number.POSITIVE_INFINITY;

    const strongLinks = links.filter((link) => link.strengthScore >= strongCutoff);
    const strongLinkLookup = new Set(strongLinks.map((link) => `${link.sourceId}|${link.label}|${link.targetId}`));
    for (const link of links) {
      link.isStrong = strongLinkLookup.has(`${link.sourceId}|${link.label}|${link.targetId}`);
    }

    const strongNodeIds = new Set<string>();
    for (const link of strongLinks) {
      strongNodeIds.add(link.sourceId);
      strongNodeIds.add(link.targetId);
    }

    const avgDegree = nodes.length > 0 ? (links.length * 2) / nodes.length : 0;
    const density = nodes.length > 1 ? (links.length * 2) / (nodes.length * (nodes.length - 1)) : 0;

    const relatedByNode = new Map<string, string[]>();
    for (const [id, relations] of relationByNode.entries()) {
      relatedByNode.set(id, Array.from(relations).sort((a, b) => a.localeCompare(b)));
    }

    return {
      nodes,
      links,
      strongLinks,
      strongNodeIds,
      nodeMap,
      relatedByNode,
      stats: {
        conceptCount: nodes.length,
        relationCount: links.length,
        strongRelationCount,
        componentCount,
        avgDegree,
        density,
      },
    };
  }, [graph]);

  const searchableNodeIds = useMemo(() => {
    return graphData.nodes
      .map((node) => node.id)
      .sort((a, b) => a.localeCompare(b));
  }, [graphData.nodes]);

  const visibleGraph = useMemo(() => {
    const strongModeActive = showStrongOnly && graphData.strongLinks.length > 0;
    const linksToShow = strongModeActive ? graphData.strongLinks : graphData.links;

    if (!strongModeActive) {
      return {
        nodes: graphData.nodes,
        links: linksToShow,
        strongModeActive,
      };
    }

    const visibleNodeIds = new Set<string>();
    for (const link of linksToShow) {
      visibleNodeIds.add(link.sourceId);
      visibleNodeIds.add(link.targetId);
    }
    if (selectedNodeId && graphData.nodeMap.has(selectedNodeId)) {
      visibleNodeIds.add(selectedNodeId);
    }

    return {
      nodes: graphData.nodes.filter((node) => visibleNodeIds.has(node.id)),
      links: linksToShow,
      strongModeActive,
    };
  }, [graphData, selectedNodeId, showStrongOnly]);

  const focusNodeById = (rawNodeId: string) => {
    const normalizedNodeId = rawNodeId.replace(/\s+/g, " ").trim();
    if (!normalizedNodeId) {
      setSearchFeedback("Type a concept name first.");
      return;
    }

    if (!graphData.nodeMap.has(normalizedNodeId)) {
      setSearchFeedback(`No concept named "${normalizedNodeId}" found.`);
      return;
    }

    if (showStrongOnly && graphData.strongLinks.length > 0 && !graphData.strongNodeIds.has(normalizedNodeId)) {
      setShowStrongOnly(false);
    }

    setSelectedNodeId(normalizedNodeId);
    setHoveredNodeId(normalizedNodeId);
    setDrawerOpen(true);
    setSearchFeedback(null);

    const targetNode = graphData.nodeMap.get(normalizedNodeId);
    if (
      graphRef.current
      && targetNode
      && typeof targetNode.x === "number"
      && typeof targetNode.y === "number"
    ) {
      graphRef.current.centerAt(targetNode.x, targetNode.y, 700);
      graphRef.current.zoom(2.2, 850);
    }
  };

  useEffect(() => {
    hasAutoFitRef.current = false;
  }, [showStrongOnly, visibleGraph.links.length, visibleGraph.nodes.length]);

  useEffect(() => {
    if (selectedNodeId && !graphData.nodeMap.has(selectedNodeId)) {
      setSelectedNodeId(null);
    }
    if (hoveredNodeId && !graphData.nodeMap.has(hoveredNodeId)) {
      setHoveredNodeId(null);
    }
  }, [graphData.nodeMap, hoveredNodeId, selectedNodeId]);

  useEffect(() => {
    if (!selectedNodeId) {
      return;
    }

    const selectedNode = graphData.nodeMap.get(selectedNodeId);
    if (
      graphRef.current
      && selectedNode
      && typeof selectedNode.x === "number"
      && typeof selectedNode.y === "number"
    ) {
      graphRef.current.centerAt(selectedNode.x, selectedNode.y, 500);
      graphRef.current.zoom(2.1, 650);
    }
  }, [graphData.nodeMap, selectedNodeId]);

  const activeNodeId = hoveredNodeId ?? selectedNodeId;
  const activeNode = activeNodeId ? graphData.nodeMap.get(activeNodeId) ?? null : null;

  const activeNeighborhood = useMemo(() => {
    if (!activeNode) {
      return new Set<string>();
    }
    return new Set([activeNode.id, ...activeNode.neighbors]);
  }, [activeNode]);

  const topConnectedNodes = useMemo(() => {
    return [...visibleGraph.nodes]
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 5);
  }, [visibleGraph.nodes]);

  if (graphData.nodes.length === 0) {
    return (
      <div className="surface concept-graph-surface">
        <h3>Concept Graph</h3>
        <p>No deck-specific concept graph data available yet.</p>
      </div>
    );
  }

  const detailRelations = activeNode
    ? (graphData.relatedByNode.get(activeNode.id) ?? [])
    : [];

  const drawerRelations = useMemo(() => {
    if (activeNode) {
      return detailRelations;
    }

    const relationSet = new Set<string>();
    for (const link of visibleGraph.links) {
      relationSet.add(link.relation);
    }
    return Array.from(relationSet);
  }, [activeNode, detailRelations, visibleGraph.links]);

  const helperText =
    hoveredLinkLabel
      ? `Relation: ${hoveredLinkLabel}`
      : activeNode
        ? `${activeNode.id} has ${activeNode.degree} direct connection${activeNode.degree === 1 ? "" : "s"}.`
        : showStrongOnly
          ? "Strongest relationship mode is active. Switch it off to view all links."
          : "Click any node to focus it and inspect related concepts.";

  return (
    <div className="surface concept-graph-surface">
      <div className="concept-graph-head">
        <h3>Concept Graph</h3>
        <p>Explore the structure of your deck and inspect relationships concept by concept.</p>
      </div>

      <div className="concept-graph-controls">
        <form
          className="concept-search-form"
          onSubmit={(event) => {
            event.preventDefault();
            const normalizedQuery = searchQuery.replace(/\s+/g, " ").trim().toLowerCase();
            if (!normalizedQuery) {
              setSearchFeedback("Type a concept name to jump.");
              return;
            }

            const exactMatch = searchableNodeIds.find((nodeId) => nodeId.toLowerCase() === normalizedQuery);
            const partialMatch = searchableNodeIds.find((nodeId) => nodeId.toLowerCase().includes(normalizedQuery));
            const match = exactMatch ?? partialMatch;

            if (!match) {
              setSearchFeedback(`No concept found for "${searchQuery}".`);
              return;
            }

            setSearchQuery(match);
            focusNodeById(match);
          }}
        >
          <input
            className="concept-search-input"
            list="concept-node-search-options"
            placeholder="Search concept and jump..."
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              if (searchFeedback) {
                setSearchFeedback(null);
              }
            }}
          />
          <datalist id="concept-node-search-options">
            {searchableNodeIds.map((nodeId) => (
              <option key={nodeId} value={nodeId} />
            ))}
          </datalist>
          <button type="submit" className="button-alt">Jump</button>
        </form>

        <label className="concept-graph-toggle">
          <input
            type="checkbox"
            checked={showStrongOnly}
            onChange={(event) => setShowStrongOnly(event.target.checked)}
          />
          Show only strongest relationships
        </label>

        <button
          type="button"
          className="concept-drawer-toggle"
          onClick={() => setDrawerOpen((value) => !value)}
        >
          {drawerOpen ? "Hide Drawer" : "Show Drawer"}
        </button>
      </div>

      {searchFeedback ? <p className="concept-search-feedback">{searchFeedback}</p> : null}

      <div className="concept-graph-stats" role="list" aria-label="Concept graph summary">
        <div className="concept-chip" role="listitem">
          <span className="concept-chip-label">Concepts shown</span>
          <strong>{visibleGraph.nodes.length}</strong>
        </div>
        <div className="concept-chip" role="listitem">
          <span className="concept-chip-label">Relations shown</span>
          <strong>{visibleGraph.links.length}</strong>
        </div>
        <div className="concept-chip" role="listitem">
          <span className="concept-chip-label">Strong relations</span>
          <strong>{graphData.stats.strongRelationCount}</strong>
        </div>
        <div className="concept-chip" role="listitem">
          <span className="concept-chip-label">Density</span>
          <strong>{(graphData.stats.density * 100).toFixed(1)}%</strong>
        </div>
      </div>

      <div className="concept-graph-layout">
        <div className="concept-graph-canvas-wrap" ref={canvasHostRef}>
          <ForceGraph2D
            ref={graphRef}
            graphData={visibleGraph}
            width={width}
            height={440}
            backgroundColor="rgba(255,255,255,0)"
            cooldownTicks={100}
            d3VelocityDecay={0.25}
            linkLabel={(link) => (link as VisualLink).label}
            linkWidth={(link) => {
              const visualLink = link as VisualLink;
              const sourceId = endpointId(visualLink.source);
              const targetId = endpointId(visualLink.target);
              const active =
                activeNodeId != null && (sourceId === activeNodeId || targetId === activeNodeId);
              if (active) {
                return visualLink.isStrong ? 3.4 : 2.8;
              }
              if (activeNodeId) {
                return 1;
              }
              return visualLink.isStrong ? 2.3 : 1.5;
            }}
            linkColor={(link) => {
              const visualLink = link as VisualLink;
              const sourceId = endpointId(visualLink.source);
              const targetId = endpointId(visualLink.target);
              const active =
                activeNodeId != null && (sourceId === activeNodeId || targetId === activeNodeId);

              if (active) {
                return "rgba(255, 94, 44, 0.92)";
              }

              if (activeNodeId) {
                return "rgba(26, 72, 90, 0.16)";
              }

              if (visualLink.isStrong) {
                return "rgba(30, 109, 132, 0.74)";
              }

              return "rgba(26, 72, 90, 0.40)";
            }}
            linkDirectionalArrowLength={(link) => {
              const visualLink = link as VisualLink;
              const sourceId = endpointId(visualLink.source);
              const targetId = endpointId(visualLink.target);
              const active =
                activeNodeId != null && (sourceId === activeNodeId || targetId === activeNodeId);
              return active ? 5.5 : 3.5;
            }}
            linkDirectionalArrowRelPos={1}
            onNodeHover={(node) => {
              setHoveredNodeId(node ? (node as VisualNode).id : null);
            }}
            onNodeClick={(node) => {
              const visualNode = node as VisualNode;
              focusNodeById(visualNode.id);
            }}
            onLinkHover={(link) => {
              if (!link) {
                setHoveredLinkLabel(null);
                return;
              }
              setHoveredLinkLabel((link as VisualLink).relation || null);
            }}
            onEngineStop={() => {
              if (!hasAutoFitRef.current && graphRef.current) {
                graphRef.current.zoomToFit(600, 60);
                hasAutoFitRef.current = true;
              }
            }}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const visualNode = node as VisualNode;
              const x = visualNode.x ?? 0;
              const y = visualNode.y ?? 0;

              const baseRadius = 6 + Math.min(9, visualNode.degree * 1.5);
              const isActive = activeNodeId === visualNode.id;
              const isNeighbor = activeNeighborhood.has(visualNode.id);
              const isDimmed = activeNodeId != null && !isNeighbor;
              const radius = isActive ? baseRadius + 2.3 : baseRadius;

              ctx.beginPath();
              ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
              ctx.fillStyle = isDimmed ? "rgba(121, 144, 157, 0.35)" : visualNode.color;
              ctx.fill();

              ctx.lineWidth = isActive ? 2.2 : 1.25;
              ctx.strokeStyle = isActive ? "#0e2735" : "rgba(255,255,255,0.82)";
              ctx.stroke();

              const showLabel =
                globalScale >= 1.15
                || visibleGraph.nodes.length <= 18
                || visualNode.degree >= 3
                || isActive;

              if (!showLabel) {
                return;
              }

              const fontSize = Math.max(11, 13 / globalScale);
              const label = visualNode.displayLabel;
              ctx.font = `${fontSize}px "Space Grotesk", sans-serif`;
              ctx.textAlign = "left";
              ctx.textBaseline = "middle";

              const textWidth = ctx.measureText(label).width;
              const padX = 6;
              const padY = 3;
              const labelX = x + radius + 6;
              const labelY = y;

              ctx.fillStyle = isDimmed ? "rgba(230,236,240,0.78)" : "rgba(245,250,253,0.92)";
              ctx.fillRect(
                labelX - padX,
                labelY - fontSize / 2 - padY,
                textWidth + padX * 2,
                fontSize + padY * 2
              );

              ctx.fillStyle = isDimmed ? "rgba(86, 101, 112, 0.88)" : "#0f2330";
              ctx.fillText(label, labelX, labelY);
            }}
            nodePointerAreaPaint={(node, color, ctx) => {
              const visualNode = node as VisualNode;
              const x = visualNode.x ?? 0;
              const y = visualNode.y ?? 0;
              const radius = 10 + Math.min(9, visualNode.degree * 1.5);
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
              ctx.fill();
            }}
          />
          <div className="concept-graph-hint">{helperText}</div>
        </div>

        <aside className="concept-graph-sidebar">
          <div className="concept-panel concept-drawer-panel">
            <div className="concept-drawer-head">
              <h4>Relationship Drawer</h4>
              <button
                type="button"
                className="concept-drawer-mini-toggle"
                onClick={() => setDrawerOpen((value) => !value)}
              >
                {drawerOpen ? "Collapse" : "Expand"}
              </button>
            </div>

            {drawerOpen ? (
              <div className="concept-drawer-body">
                <p className="concept-panel-subtitle">
                  {activeNode
                    ? `Showing full relationship text for ${activeNode.id}.`
                    : `Showing full relationship text for ${visibleGraph.strongModeActive ? "strong" : "all"} links.`}
                </p>

                <ul className="concept-relation-list concept-relation-list-full">
                  {drawerRelations.length > 0 ? (
                    drawerRelations.map((relation, index) => (
                      <li key={`${relation}-${index}`}>{relation}</li>
                    ))
                  ) : (
                    <li>No relationship text available.</li>
                  )}
                </ul>
              </div>
            ) : (
              <p className="concept-panel-subtitle">Drawer collapsed. Expand to read full relationship text.</p>
            )}
          </div>

          <div className="concept-panel">
            <h4>{activeNode ? trimLabel(activeNode.id, 46) : "Node Details"}</h4>
            {activeNode ? (
              <>
                <p className="concept-panel-subtitle">Direct connections: {activeNode.degree}</p>
                <ul className="concept-relation-list concept-neighbor-list">
                  {activeNode.neighbors.length > 0 ? (
                    activeNode.neighbors.map((neighborId) => (
                      <li key={neighborId}>{neighborId}</li>
                    ))
                  ) : (
                    <li>No connected concepts yet.</li>
                  )}
                </ul>
              </>
            ) : (
              <>
                <p className="concept-panel-subtitle">Select a node to inspect linked concepts.</p>
                <ul className="concept-relation-list">
                  {topConnectedNodes.length > 0 ? (
                    topConnectedNodes.map((node) => (
                      <li key={node.id}>
                        {trimLabel(node.id, 52)} ({node.degree})
                      </li>
                    ))
                  ) : (
                    <li>No concept nodes found.</li>
                  )}
                </ul>
              </>
            )}

            <p className="concept-panel-subtitle">Larger nodes are more connected ideas.</p>
            <p className="concept-panel-subtitle">Nodes with the same color belong to the same concept cluster.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
