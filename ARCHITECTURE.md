# Architecture Overview

This project converts CSV exports from an Oracle database into a graph that can be explored via a CLI or a React visualization. The build step ingests structured data and produces two primary outputs:

- `data/nodes.json` – a JSON representation of every database object and its transitive dependencies.
- `data/object_stats.csv` – a flat table summarizing how many dependencies each object has and how many other objects use it.

## Data Flow

1. **CSV Extraction** – SQL scripts (see the `sample/` directory) produce several CSV files describing the schema: tables, views, parent/child relationships, object dependencies and trigger bodies.
2. **Graph Assembly** – `src/build.ts` reads the CSV files and loads them into `DbObject` instances. Each `DbObject` groups direct dependencies by type (tables, views, packages, etc.).
3. **Graph Expansion** – The `buildNode` function converts the map of `DbObject` instances into a tree of `DependencyNode` objects. Recursion and memoisation prevent infinite loops and keep shared subtrees intact.
4. **Serialization** – `writeJsonFiles` writes two artifacts:
   - `visualization_data.json.gz` – a compact representation for the React visualizer.
   - `nodes.json` – an expanded form used by the CLI.
5. **CSV Summary** – `writeCsvFile` iterates over the nodes, uses `buildNodeSummary` to compute dependency counts, and writes `object_stats.csv`.

## Component Hierarchy

- **CLI (`src/app.ts`)** – wraps the build and usage functionality behind Commander.js commands.
- **Build Module (`src/build.ts`)** – orchestrates CSV parsing, graph construction and serialization.
- **Usage Module (`src/usages.ts`)** – loads the graph and reports which objects reference a target object.
- **Utilities (`src/utils.ts`)** – shared data structures and helper functions used across the codebase.
- **React Visualizer (`src/visualizer`)** – consumes `visualization_data.json.gz` to render the dependency graph in a browser.

## Current Graph Structure

Nodes represent database objects. Each node contains a list of other nodes that it depends on, forming a directed graph. Edges are implicit and stored within the `dependencies` array of each `DependencyNode`.

Because only dependency direction is captured, the graph is effectively a forest where each node knows about its downstream dependencies. Usage (incoming edges) is calculated on demand by scanning other nodes.

## CSV → nodes.json Transformation

The transformation pipeline is handled by `build.ts`:

1. **Parse** all CSV files with `readCSV`.
2. **Normalize** object types (e.g., PROCEDURE → FUNCTION).
3. **Populate** `DbObject` instances and link direct dependencies.
4. **Expand** `DbObject` map into recursive `DependencyNode` structures.
5. **Write** the nodes to `nodes.json` for later consumption.

This process allows the CLI and visualizer to work from a unified representation of the database schema.
