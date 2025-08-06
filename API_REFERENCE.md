# API Reference

This document describes the primary classes, functions and data formats exposed by the database dependency analyzer.

## Data Structures

### `DbObject`

Represents a database entity and its direct dependencies.

```ts
new DbObject(name: string, type: string)
```

- `id: string` – Unique identifier (`NAME+TYPE`).
- `tables`, `views`, `packages`, `triggers`, `functions`, `types`, `sequences`, `synonyms`: `Set<string>` collections of referenced object names.

### `DependencyNode`

Recursive graph node used for serialization.

```ts
new DependencyNode(name: string, type: string)
```

- `id: string`
- `dependencies: DependencyNode[]`
- `allDependencyIds: string[]` – lazily computed list of all transitive dependency IDs.
- `toVisualizationJson()` – returns a compact `VisualizationNode` for the React client.
- `toJson()` – returns a JSON string of the node and its dependencies.

### `NodeSummary`

Aggregated counts of dependencies (`down`) and usages (`up`). Used when generating the CSV summary and in the `usages` command.

## Functions

### `buildObjectStatistics()`

Located in `src/build.ts`. Reads CSV exports, builds the dependency graph and writes `nodes.json` and `object_stats.csv`.

### `displayUsages(object: string, type?: string)`

Located in `src/usages.ts`. Loads `nodes.json` and prints which objects reference the target object. The type can be provided separately or as `OBJECT+TYPE`.

### `readCSV(filename: string)`

Utility in `src/utils.ts` that parses a CSV relative to the module and resolves with an array of row objects.

### `buildNodeSummary(node: DependencyNode)`

Generates a `NodeSummary` for a given node, computing transitive dependency sets.

### `findUsage(summary: NodeSummary, node: DependencyNode)`

Recursively walks `node` and records any usages of `summary.id` into the summary's `up` sets.

## nodes.json Schema

`nodes.json` is an array of serialized `DependencyNode` objects. Each object has the following structure:

```json
{
  "id": "EMPLOYEES+TABLE",
  "name": "EMPLOYEES",
  "type": "TABLE",
  "dependencies": [
    /* nested DependencyNodes */
  ]
}
```

## Configuration

No external configuration files are required. The CLI exposes two commands:

- `db-dependencies build`
- `db-dependencies usages <object> [type]`

Paths to CSV files and output locations are currently hard coded relative to the repository.
