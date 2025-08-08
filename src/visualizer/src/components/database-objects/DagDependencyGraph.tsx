import { useEffect, useRef, useState } from "react";
import cytoscape, { ElementsDefinition } from "cytoscape";
import dagre from "cytoscape-dagre";
import coseBilkent from "cytoscape-cose-bilkent";
import Button from "@cloudscape-design/components/button";
import { DatabaseObject } from "../../utils/DataExtractor";
import PerformanceHud from "./PerformanceHud";
import { selectLayout } from "../../utils/layout";
import useResizeObserver from "../../hooks/useResizeObserver";

cytoscape.use(dagre);
cytoscape.use(coseBilkent);

type Props = {
  worker: Worker;
  databaseObject: DatabaseObject;
  parseMs: number;
  splitPanelSize: number;
};

export default function DagDependencyGraph({
  worker,
  databaseObject,
  parseMs,
  splitPanelSize,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [elements, setElements] = useState<ElementsDefinition>({
    nodes: [],
    edges: [],
  });
  const [hops, setHops] = useState(1);
  const [layoutMs, setLayoutMs] = useState(0);
  useResizeObserver(containerRef); // trigger re-render on resize

  useEffect(() => {
    const handler = (event: MessageEvent<any>) => {
      if (event.data.type === "neighborhood" && event.data.id === databaseObject.id) {
        setElements({ nodes: event.data.nodes, edges: event.data.edges });
      }
    };
    worker.addEventListener("message", handler);
    return () => worker.removeEventListener("message", handler);
  }, [worker, databaseObject.id]);

  useEffect(() => {
    worker.postMessage({
      type: "neighborhood",
      id: databaseObject.id,
      hops,
    });
  }, [worker, databaseObject.id, hops]);

  useEffect(() => {
    if (!containerRef.current) return;
    const layoutName = selectLayout(true);
    const start = performance.now();
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "background-color": "#1f77b4",
            "text-valign": "center",
            "text-halign": "center",
            color: "#fff",
            "font-size": 10,
          },
        },
        {
          selector: "edge",
          style: {
            width: 1,
            "line-color": "#ccc",
            "target-arrow-color": "#ccc",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
          },
        },
      ],
      layout: { name: layoutName, animate: false },
      renderer: { name: "webgl", textureOnViewport: true },
    });
    const layoutTime = performance.now() - start;
    setLayoutMs(layoutTime);
    return () => {
      cy.destroy();
    };
  }, [elements]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: `${splitPanelSize}px`, position: "relative" }}
    >
      <Button
        onClick={() => setHops((h) => h + 1)}
        style={{ position: "absolute", zIndex: 1 }}
        variant="primary"
      >
        Expand
      </Button>
      <PerformanceHud
        parseMs={parseMs}
        nodes={elements.nodes.length}
        edges={elements.edges.length}
        layoutMs={layoutMs}
      />
    </div>
  );
}
