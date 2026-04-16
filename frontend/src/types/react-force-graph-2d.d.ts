declare module "react-force-graph-2d" {
  import * as React from "react";

  type GraphData = {
    nodes: Array<Record<string, unknown>>;
    links: Array<Record<string, unknown>>;
  };

  type ForceGraphProps = {
    graphData: GraphData;
    width?: number;
    height?: number;
    nodeAutoColorBy?: string;
    linkLabel?: string;
    cooldownTicks?: number;
    backgroundColor?: string;
  };

  const ForceGraph2D: React.ComponentType<ForceGraphProps>;
  export default ForceGraph2D;
}
