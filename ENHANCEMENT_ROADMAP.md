# Enhancement Roadmap

Suggestions for future improvements to the database dependency analyzer.

## Graph Model

- **Introduce explicit edges** – Store relationships in an `edges.json` file alongside `nodes.json` to make traversal and querying more efficient.
- **Bidirectional links** – Persist reverse edges so usage lookups do not require scanning every node.
- **Edge metadata** – Add attributes describing the nature of the dependency (e.g., `CALLS`, `TRIGGERS`, `READS`).

## nodes.json Structure

- Include a version field to allow future schema changes.
- Provide optional human‑readable descriptions or comments for nodes.
- Split large graphs into multiple files to reduce memory footprint when loading.

## Client Interface

- Build a richer web client that supports searching, filtering and interactive path exploration.
- Offer a command to export subgraphs for a specific object or schema.
- Provide a REST or GraphQL API for remote consumers.

## Performance Optimizations

- Use streaming and backpressure when building the graph to handle very large datasets.
- Persist caches (e.g., the `nodeSummaryCache`) to disk to avoid recomputation.
- Parallelize CSV parsing and node construction.

## Additional Analysis Features

- Detect cycles and report strongly connected components.
- Highlight unused or orphaned objects.
- Generate impact reports showing all objects affected by a change to a table or package.
- Support comparing two versions of the schema to spot differences.
