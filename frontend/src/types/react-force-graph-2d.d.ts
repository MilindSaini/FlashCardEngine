declare module "react-force-graph-2d" {
  import * as React from "react";

  type NodeObject = Record<string, unknown>;
  type LinkObject = Record<string, unknown>;

  type GraphData = {
    nodes: NodeObject[];
    links: LinkObject[];
  };

  type ForceGraphMethods = {
    centerAt: (x?: number, y?: number, ms?: number) => void;
    zoom: (k: number, ms?: number) => void;
    zoomToFit: (ms?: number, padding?: number) => void;
  };

  type ForceGraphProps = {
    ref?: React.Ref<ForceGraphMethods>;
    graphData: GraphData;
    width?: number;
    height?: number;
    nodeAutoColorBy?: string;
    nodeVal?: number | string | ((node: NodeObject) => number);
    nodeLabel?: string | ((node: NodeObject) => string);
    nodeCanvasObject?: (node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => void;
    nodePointerAreaPaint?: (node: NodeObject, color: string, ctx: CanvasRenderingContext2D) => void;
    linkLabel?: string | ((link: LinkObject) => string);
    linkWidth?: number | ((link: LinkObject) => number);
    linkColor?: string | ((link: LinkObject) => string);
    linkDirectionalArrowLength?: number | ((link: LinkObject) => number);
    linkDirectionalArrowRelPos?: number;
    d3VelocityDecay?: number;
    onNodeHover?: (node: NodeObject | null) => void;
    onNodeClick?: (node: NodeObject) => void;
    onLinkHover?: (link: LinkObject | null) => void;
    onEngineStop?: () => void;
    cooldownTicks?: number;
    backgroundColor?: string;
  };

  const ForceGraph2D: React.ComponentType<ForceGraphProps>;
  export default ForceGraph2D;
}
