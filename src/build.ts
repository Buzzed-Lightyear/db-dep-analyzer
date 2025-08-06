// ---------------------------------------------------------------------------
// build.ts
// ---------------------------------------------------------------------------
//
// Responsible for transforming a set of CSV exports from an Oracle database
// into a graph representation of dependencies.  The process can be broken down
// into three high‑level phases:
//
//   1. Load raw tabular data from CSV files
//   2. Combine that data into an in‑memory graph of `DbObject` instances
//   3. Serialize the graph to various output formats (JSON for the visualizer
//      and a CSV summary for ad‑hoc querying)
//
// The graph is ultimately stored in `data/nodes.json` where each node
// corresponds to a single database object and contains its transitive
// dependencies.
// ---------------------------------------------------------------------------
import {
  DbObject,
  findUsage,
  readCSV,
  buildNodeSummary,
  DependencyNode,
} from "./utils";
import { createWriteStream, writeFileSync } from "fs";
import { join } from "path";
import { gzipSync } from "zlib";

// Interfaces describing the structure of the input CSV files.  These mirror the
// columns produced by the SQL queries in `sample/`.
interface CsvTable {
  TABLE_NAME: string; // Name of a table in the database
}

interface CsvView {
  VIEW_NAME: string; // Name of a view in the database
}

// Parent/child relationships are used to map views to their underlying tables
// or tables to other tables (e.g. partition hierarchies).
interface CsvParentChild {
  parent: string;
  child: string;
}

// The raw dependency export. Each record states that `NAME` (of type `TYPE`)
// references another object `REFERENCED_NAME` of `REFERENCED_TYPE`.
interface CsvDependency {
  REFERENCED_OWNER: string;
  NAME: string;
  TYPE: string;
  REFERENCED_NAME: string;
  REFERENCED_TYPE: string;
}

// Trigger metadata used to capture additional function usage information.
interface CsvTriggerDetail {
  TABLE_NAME: string;
  TRIGGER_NAME: string;
  TRIGGER_TYPE: string;
  TRIGGERING_EVENT: string;
  TRIGGER_BODY: string; // Raw PL/SQL body of the trigger
}

// Toggle for console warnings when unexpected data is encountered.  Leaving this
// on helps catch data anomalies during the build process.
const showWarnings = true;

// Collection of all discovered database objects, indexed by `name+type`.
const dbObjects = new Map<string, DbObject>();

// Cache of `DependencyNode`s used while constructing the graph to avoid
// rebuilding subtrees and to prevent infinite recursion on cyclic dependencies.
const nodeCache = new Map<string, DependencyNode>();

export default async function buildObjectStatistics() {
  // -----------------------------------------------------------------------
  // 1. Load raw data from CSV files
  // -----------------------------------------------------------------------
  // Each CSV file corresponds to a different aspect of the database schema.
  const tableNames = (await readCSV("../data/tables.csv")) as CsvTable[];
  console.log(`${tableNames.length} tables read from tables.csv`);
  const viewNames = (await readCSV("../data/views.csv")) as CsvView[];
  console.log(`${viewNames.length} views read from views.csv`);
  const parentChild = (await readCSV(
    "../data/parent_child.csv",
  )) as CsvParentChild[];
  console.log(
    `${parentChild.length} parent-child relationships read from parent_child.csv`,
  );
  const dependencies = (await readCSV(
    "../data/dependencies.csv",
  )) as CsvDependency[];
  console.log(
    `${dependencies.length} object dependencies read from dependencies.csv`,
  );
  const triggerDetails = (await readCSV(
    "../data/trigger_details.csv",
  )) as CsvTriggerDetail[];
  console.log(
    `${triggerDetails.length} triggers with details read from trigger_details.csv`,
  );

  console.log("Processing all data. This may take several minutes...");

  // -----------------------------------------------------------------------
  // 2. Build DbObject instances for every discovered object
  // -----------------------------------------------------------------------
  // Seed the object map with the base set of tables and views.
  tableNames.forEach((table) => {
    const dbObject = new DbObject(table.TABLE_NAME, "TABLE");
    dbObjects.set(dbObject.id, dbObject);
  });
  viewNames.forEach((view) => {
    const dbObject = new DbObject(view.VIEW_NAME, "VIEW");
    dbObjects.set(dbObject.id, dbObject);
  });

  // Resolve parent/child relationships to build table/view dependencies.
  parentChild.forEach((entry) => {
    if (dbObjects.has(`${entry.parent}+TABLE`)) {
      const dbObject = dbObjects.get(`${entry.parent}+TABLE`);
      if (dbObjects.has(`${entry.child}+TABLE`)) {
        dbObject.tables.add(entry.child);
      } else {
        showWarnings &&
          console.warn("parent_child unhandled child view: ", entry);
      }
    } else if (dbObjects.has(`${entry.parent}+VIEW`)) {
      const dbObject = dbObjects.get(`${entry.parent}+VIEW`);
      if (dbObjects.has(`${entry.child}+TABLE`)) {
        dbObject.tables.add(entry.child);
      } else {
        showWarnings &&
          console.warn("parent_child unhandled child view: ", entry);
      }
    } else {
      showWarnings &&
        console.warn("parent_child table/view not found: ", entry);
    }
  });

  // Read dependency rows and merge them into the DbObject graph. Any referenced
  // object that does not yet exist is created on the fly so that the graph is
  // complete.
  dependencies.forEach((dependency) => {
    dependency.TYPE = normalizeType(dependency.TYPE);
    dependency.REFERENCED_TYPE = normalizeType(dependency.REFERENCED_TYPE);

    const id = `${dependency.NAME}+${dependency.TYPE}`;
    let dbObject: DbObject;
    if (dbObjects.has(id)) {
      dbObject = dbObjects.get(id);
    } else {
      dbObject = new DbObject(dependency.NAME, dependency.TYPE);
      dbObjects.set(id, dbObject);
    }

    // Ensure the referenced object exists in the map
    if (
      !dbObjects.has(
        `${dependency.REFERENCED_NAME}+${dependency.REFERENCED_TYPE}`,
      )
    ) {
      const referencedObject = new DbObject(
        dependency.REFERENCED_NAME,
        dependency.REFERENCED_TYPE,
      );
      dbObjects.set(referencedObject.id, referencedObject);
    }

    // Record the dependency by adding the referenced object to the appropriate
    // set on the source object.
    if (dependency.REFERENCED_TYPE === "TABLE") {
      dbObject.tables.add(dependency.REFERENCED_NAME);
    } else if (dependency.REFERENCED_TYPE === "VIEW") {
      dbObject.views.add(dependency.REFERENCED_NAME);
    } else if (dependency.REFERENCED_TYPE === "PACKAGE") {
      dbObject.packages.add(dependency.REFERENCED_NAME);
    } else if (dependency.REFERENCED_TYPE === "TRIGGER") {
      dbObject.triggers.add(dependency.REFERENCED_NAME);
    } else if (dependency.REFERENCED_TYPE === "FUNCTION") {
      dbObject.functions.add(dependency.REFERENCED_NAME);
    } else if (dependency.REFERENCED_TYPE === "TYPE") {
      dbObject.types.add(dependency.REFERENCED_NAME);
    } else if (dependency.REFERENCED_TYPE === "SEQUENCE") {
      dbObject.sequences.add(dependency.REFERENCED_NAME);
    } else if (dependency.REFERENCED_TYPE === "SYNONYM") {
      dbObject.synonyms.add(dependency.REFERENCED_NAME);
    } else {
      showWarnings && console.warn("unsupported reference type", dependency);
    }
  });

  // Scan trigger bodies for function names. This is a heuristic approach that
  // detects function usage within trigger PL/SQL source code.
  const functionNames = Object.keys(dbObjects).filter((key) =>
    key.endsWith("+FUNCTION"),
  );
  triggerDetails.forEach((triggerDetail) => {
    const id = `${triggerDetail.TRIGGER_NAME}+TRIGGER`;
    let trigger = dbObjects.get(id);
    if (!trigger) {
      trigger = new DbObject(triggerDetail.TRIGGER_NAME, "TRIGGER");
      dbObjects.set(trigger.id, trigger);
    }

    // Attach trigger to its table/view
    const table = dbObjects.get(`${triggerDetail.TABLE_NAME}+TABLE`);
    if (table) table.triggers.add(triggerDetail.TRIGGER_NAME);

    const view = dbObjects.get(`${triggerDetail.TABLE_NAME}+VIEW`);
    if (view) view.triggers.add(triggerDetail.TRIGGER_NAME);

    if (!view && !table) {
      showWarnings &&
        console.warn(
          "triggerDetails table/view not found: ",
          triggerDetail.TABLE_NAME,
        );
    }

    // Naively search the trigger body for function invocations by string match.
    const upperCaseBody = triggerDetail.TRIGGER_BODY.toUpperCase();
    functionNames.forEach((functionName) => {
      if (upperCaseBody.includes(functionName)) {
        trigger.functions.add(functionName);
      }
    });
  });

  console.log("Finished combining data points");

  // -----------------------------------------------------------------------
  // 3. Serialize results
  // -----------------------------------------------------------------------
  const nodes = writeJsonFiles();

  writeCsvFile(nodes);
}

// Normalize Oracle specific type names to the reduced set used by this tool.
// This keeps the graph small and consistent by collapsing synonymous object
// types (e.g. PROCEDURE -> FUNCTION).
function normalizeType(type: string) {
  if (type === "PROCEDURE") {
    return "FUNCTION";
  } else if (type === "MATERIALIZED VIEW") {
    return "VIEW";
  } else if (type === "PACKAGE BODY") {
    return "PACKAGE";
  } else if (type === "TYPE BODY") {
    return "TYPE";
  } else {
    return type.toUpperCase();
  }
}

// Recursively convert the flat `DbObject` map into a tree of `DependencyNode`s.
//
// The `stack` array keeps track of the current traversal path.  It is used to
// short‑circuit cycles so that the generated JSON is acyclic and safe to
// serialize.  Nodes are memoized in `nodeCache` to avoid rebuilding the same
// subtree multiple times.
function buildNode(id: string, stack: string[] = []): DependencyNode {
  if (nodeCache.has(id)) return nodeCache.get(id)!;

  const dbObject = dbObjects.get(id)!;

  const node = new DependencyNode(dbObject.name, dbObject.type);
  nodeCache.set(id, node);

  stack.push(id);

  dbObject.tables.forEach((table) => {
    // Ignore repeated table
    if (stack.includes(`${table}+TABLE`)) return;
    node.dependencies.push(buildNode(`${table}+TABLE`, stack));
  });
  dbObject.views.forEach((view) => {
    // Ignore repeated view
    if (stack.includes(`${view}+VIEW`)) return;
    node.dependencies.push(buildNode(`${view}+VIEW`, stack));
  });
  dbObject.packages.forEach((pack) => {
    // Ignore repeated package
    if (stack.includes(`${pack}+PACKAGE`)) return;
    node.dependencies.push(buildNode(`${pack}+PACKAGE`, stack));
  });
  dbObject.triggers.forEach((trigger) => {
    // Ignore nested triggers
    if (stack.some((s) => s.includes("TRIGGER"))) return;
    node.dependencies.push(buildNode(`${trigger}+TRIGGER`, stack));
  });
  dbObject.functions.forEach((func) => {
    // Ignore repeated function
    if (stack.includes(`${func}+FUNCTION`)) return;
    node.dependencies.push(buildNode(`${func}+FUNCTION`, stack));
  });
  dbObject.types.forEach((type) => {
    // Ignore repeated type
    if (stack.includes(`${type}+TYPE`)) return;
    node.dependencies.push(buildNode(`${type}+TYPE`, stack));
  });
  dbObject.sequences.forEach((sequence) => {
    // Ignore repeated sequence
    if (stack.includes(`${sequence}+SEQUENCE`)) return;
    node.dependencies.push(buildNode(`${sequence}+SEQUENCE`, stack));
  });
  dbObject.synonyms.forEach((synonym) => {
    // Ignore repeated synonym
    if (stack.includes(`${synonym}+SYNONYM`)) return;
    node.dependencies.push(buildNode(`${synonym}+SYNONYM`, stack));
  });

  stack.pop();

  return node;
}

// Build and write the final JSON artifacts used by the visualizer and the CLI.
// Returns the array of fully populated `DependencyNode`s for further processing
// (the CSV writer reuses the in‑memory representation).
function writeJsonFiles(): DependencyNode[] {
  console.log("Sorting and writing data to JSON...");

  const nodes: DependencyNode[] = [];

  // Construct a node for every known object.
  Array.from(dbObjects.keys()).forEach((id) => {
    nodes.push(buildNode(id));
  });

  nodes.sort((a, b) => (a.name > b.name ? 1 : -1));

  console.log(`Writing ${nodes.length} nodes...`);

  // Compressed JSON used by the React visualizer.
  writeGzipJsonArray(
    join(__dirname, "/../data/visualization_data.json.gz"),
    nodes.map((node) => node.toVisualizationJson()),
  );

  // Expanded JSON used by the CLI when searching for usages.
  writeJsonArray(
    join(__dirname, "/../data/nodes.json"),
    nodes.map((node) => node.toJson()),
  );

  console.log("Finished writing data to JSON");

  return nodes;
}

// Helper to write an array of JSON objects to disk in gzip compressed form.
// Writing manually rather than using `JSON.stringify` on the entire array keeps
// memory usage low for large datasets.
function writeGzipJsonArray(filename: string, jsonArray: unknown[]) {
  const buffers = [Buffer.from("[")];
  jsonArray.forEach((item, index) => {
    const buf = Buffer.from(JSON.stringify(item));
    buffers.push(buf);
    if (index + 1 < jsonArray.length) {
      buffers.push(Buffer.from(","));
    }
  });
  buffers.push(Buffer.from("]"));

  const finalBuffer = gzipSync(Buffer.concat(buffers));

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  writeFileSync(filename, finalBuffer);
}

// Similar to `writeGzipJsonArray` but writes plain JSON to disk using a stream
// to avoid buffering the entire file in memory.
function writeJsonArray(filename: string, jsonArray: unknown[]) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const writeStream = createWriteStream(filename);
  writeStream.write("[");
  jsonArray.forEach((item: unknown, index: number) => {
    writeStream.write(item);
    if (index + 1 < jsonArray.length) {
      writeStream.write(",");
    }
  });
  writeStream.end("]");
}

// Emit a CSV summarizing for each object both the dependencies it relies on and
// the objects that depend on it (usage).  This is useful for quick spreadsheet
// analysis without traversing the full graph.
function writeCsvFile(nodes: DependencyNode[]) {
  console.log("Building usage stats and writing object statistics to CSV...");

  const headerLabels = [
    "name",
    "type",
    "table dependencies",
    "view dependencies",
    "package dependencies",
    "trigger dependencies",
    "functions/proc dependencies",
    "type dependencies",
    "sequence dependencies",
    "synonym dependencies",
    "table usage",
    "view usage",
    "package usage",
    "trigger usage",
    "functions/proc usage",
    "type usage",
    "sequence usage",
    "synonym usage",
  ];

  let fileContents = `${headerLabels.join(",")}\n`;

  nodes.forEach((node) => {
    // Build a summary of this node's own dependencies
    const summary = buildNodeSummary(node);
    // Determine which other nodes reference this one by walking the list of
    // nodes and checking their dependency lists.
    nodes
      .filter(
        (innerNode) =>
          innerNode.id !== summary.id &&
          innerNode.allDependencyIds.includes(summary.id),
      )
      .forEach((innerNode) => {
        findUsage(summary, innerNode);
      });
    fileContents += summary.rowDetails + "\n";
  });

  writeFileSync(join(__dirname, "/../data/object_stats.csv"), fileContents);
}
