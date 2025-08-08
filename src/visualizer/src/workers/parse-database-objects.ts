/* eslint-disable no-restricted-globals */

import { inflate } from "pako";
import {
  VisualizationData,
  extractDatabaseObjects,
} from "../utils/DataExtractor";

type ParseMessage = { type: "parse"; buffer: ArrayBuffer };
type NeighborhoodMessage = { type: "neighborhood"; id: string; hops: number };
type WorkerMessage = ParseMessage | NeighborhoodMessage;

type NodeRecord = { i: string; e: boolean; u: string[] };

const graph = new Map<string, NodeRecord>();

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;
  if (msg.type === "parse") {
    const start = performance.now();
    const byteArray = inflate(msg.buffer);
    const jsonData = JSON.parse(new TextDecoder().decode(byteArray)) as VisualizationData[];
    const databaseObjects = extractDatabaseObjects(jsonData);

    graph.clear();
    jsonData.forEach((item) =>
      graph.set(item.i, { i: item.i, e: item.e, u: item.u ?? [] }),
    );

    const parseMs = performance.now() - start;
    self.postMessage({
      type: "parsed",
      databaseObjects,
      parseMs,
    });
  } else if (msg.type === "neighborhood") {
    const { id, hops } = msg;
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id, depth: 0 }];
    const nodes: unknown[] = [];
    const edges: unknown[] = [];

    while (queue.length > 0) {
      const { id: nid, depth } = queue.shift()!;
      if (visited.has(nid) || depth > hops) {
        continue;
      }
      visited.add(nid);
      const node = graph.get(nid);
      if (!node) {
        continue;
      }
      nodes.push({
        data: { id: node.i, label: node.i.split("+")[0], duplicate: node.e },
      });
      if (depth < hops) {
        node.u.forEach((dep) => {
          edges.push({ data: { source: node.i, target: dep } });
          queue.push({ id: dep, depth: depth + 1 });
        });
      }
    }

    self.postMessage({ type: "neighborhood", id, nodes, edges });
  }
};
