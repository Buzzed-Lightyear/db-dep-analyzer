import { createReadStream } from "fs";
import { join } from "path";
import { createParseStream } from "big-json";
import {
  buildNodeSummary,
  DependencyNode,
  findUsage,
  NodeSummary,
} from "./utils";

// ---------------------------------------------------------------------------
// usages.ts
// ---------------------------------------------------------------------------
//
// Implements the `usages` CLI command. It loads the previously generated
// `nodes.json` file and searches for all incoming edges to a given object. The
// output is printed to the console in a human readable form.

// Cache constructed DependencyNode instances to avoid rebuilding shared
// subgraphs when deserializing the JSON file.
const nodeCache = new Map<string, DependencyNode>();

// Entry point used by the CLI.  It reads the serialized graph and then delegates
// to `processNodes` to compute the usage information for the requested object.
export default async function displayUsages(object: string, type: string) {
  let nodes: DependencyNode[];

  try {
    console.log("Reading all nodes. This make take a few moments...");
    nodes = await readNodes();
    console.log(`${nodes.length} nodes loaded!`);
  } catch (error) {
    console.log("Failed to find usages", error);
  }

  console.log("Processing request...");
  processNodes(object, type, nodes);
}

// Stream and parse `nodes.json` to avoid loading the entire file into memory at
// once. `big-json` handles chunked parsing and calls the handler for each item
// in the array.
async function readNodes(): Promise<DependencyNode[]> {
  return new Promise((resolve, reject) => {
    const nodes: DependencyNode[] = [];

    const readStream = createReadStream(join(__dirname, "/../data/nodes.json"));
    const parseStream = createParseStream()
      .on("error", (error) => reject(error))
      .on("data", (items: DependencyNode[]) => {
        items.forEach((item) => nodes.push(buildDependencyNode(item)));
      })
      .on("end", () => {
        resolve(nodes);
      });
    readStream.pipe(parseStream as unknown as NodeJS.WritableStream);
  });
}

// Convert the plain object structure read from disk back into instances of
// `DependencyNode`.  This mirrors the recursive structure created in build.ts.
// A cache is used to prevent reconstructing duplicate nodes when the JSON file
// contains shared subtrees.
function buildDependencyNode(node: DependencyNode): DependencyNode {
  if (nodeCache.has(node.id)) return nodeCache.get(node.id)!;

  const depNode = new DependencyNode(node.name, node.type);
  nodeCache.set(node.id, depNode);

  depNode.dependencies.push(
    ...node.dependencies.map((dep) => buildDependencyNode(dep)),
  );

  return depNode;
}

// Locate all nodes that match the requested id (object name + optional type) and
// produce a usage summary for each.  The resulting summary lists which objects
// depend on the target object, grouped by type.
function processNodes(object: string, type: string, nodes: DependencyNode[]) {
  const id = type ? `${object}+${type}` : object;
  const foundNodes = nodes.filter((node) => node.id.startsWith(id));

  if (foundNodes.length === 0) {
    console.warn(
      `No objects found starting with ${object}${type ? " with type " + type : ""}`,
    );
    return;
  }

  console.log(
    `Found ${foundNodes.length} matching node(s). This may take a few moments to find usages...`,
  );

  const nodeSummaries: NodeSummary[] = [];
  foundNodes.forEach((foundNode) => {
    const summary = buildNodeSummary(foundNode);
    // Search every other node to see if it references the current one. This is
    // effectively a reverse edge lookup.
    nodes.forEach((innerNode) => {
      if (
        innerNode.id !== summary.id &&
        innerNode.allDependencyIds.includes(summary.id)
      ) {
        findUsage(summary, innerNode);
      }
    });
    nodeSummaries.push(summary);
  });

  // Print the results in an easy to scan form grouped by dependency type.
  nodeSummaries.forEach((summary) => {
    console.log(
      `******************************* START ${summary.id} *******************************`,
    );
    console.log(
      `TABLES(${summary.up.tables.size}):    ` +
        [...Array.from(summary.up.tables)].join(", "),
    );
    console.log(
      `VIEWS(${summary.up.views.size}):     ` +
        [...Array.from(summary.up.views)].join(", "),
    );
    console.log(
      `PACKAGES(${summary.up.packages.size}):  ` +
        [...Array.from(summary.up.packages)].join(", "),
    );
    console.log(
      `TRIGGERS(${summary.up.triggers.size}):  ` +
        [...Array.from(summary.up.triggers)].join(", "),
    );
    console.log(
      `FUNCTIONS(${summary.up.functions.size}): ` +
        [...Array.from(summary.up.functions)].join(", "),
    );
    console.log(
      `TYPES(${summary.up.types.size}):     ` +
        [...Array.from(summary.up.types)].join(", "),
    );
    console.log(
      `SEQUENCES(${summary.up.sequences.size}): ` +
        [...Array.from(summary.up.sequences)].join(", "),
    );
    console.log(
      `SYNONYMS(${summary.up.synonyms.size}):  ` +
        [...Array.from(summary.up.synonyms)].join(", "),
    );
    console.log(
      `******************************* END ${summary.id} *******************************`,
    );
  });
}
