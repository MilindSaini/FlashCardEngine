import { useEffect, useMemo, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";

type GraphNode = { id: string };
type GraphLink = { source: string; target: string; label?: string };

type ConceptGraphProps = {
  graphJson?: string;
};

export function ConceptGraph({ graphJson }: ConceptGraphProps) {
  const [width, setWidth] = useState(Math.min(680, window.innerWidth - 40));

  useEffect(() => {
    const resize = () => setWidth(Math.min(680, window.innerWidth - 40));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const graphData = useMemo(() => {
    if (graphJson) {
      try {
        const parsed = JSON.parse(graphJson) as {
          nodes?: GraphNode[];
          links?: GraphLink[];
        };
        if (parsed.nodes?.length && parsed.links?.length) {
          return {
            nodes: parsed.nodes,
            links: parsed.links,
          };
        }
      } catch {
      }
    }

    return {
      nodes: [
        { id: "Core Idea" },
        { id: "Definition" },
        { id: "Exception" },
        { id: "Example" },
      ],
      links: [
        { source: "Core Idea", target: "Definition", label: "clarified by" },
        { source: "Core Idea", target: "Exception", label: "challenged by" },
        { source: "Core Idea", target: "Example", label: "applied in" },
      ],
    };
  }, [graphJson]);

  return (
    <div className="surface">
      <h3>Concept Graph</h3>
      <ForceGraph2D
        graphData={graphData}
        width={width}
        height={320}
        backgroundColor="rgba(255,255,255,0)"
        nodeAutoColorBy="id"
        linkLabel="label"
        cooldownTicks={70}
      />
    </div>
  );
}
