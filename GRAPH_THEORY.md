# Graph Theory Concepts

The database dependency analyzer models schema objects as a directed graph. Understanding the graph terminology helps reason about the output.

## Implemented Concepts

- **Nodes** – Each database object (table, view, function, etc.) becomes a node.
- **Directed Edges** – Dependencies are represented as outgoing edges from one node to another. Edges are stored implicitly within each node's `dependencies` array.
- **Transitive Closure** – During graph construction, the analyzer recursively expands dependencies so every node contains the full set of objects it depends on.
- **Duplicate Detection** – When serializing to the visualization format a cache prevents infinite recursion and marks repeated nodes as duplicates.

## Potential Enhancements

- **Explicit Edge List** – Currently edges are embedded within nodes. A separate `edges.json` could make relationship queries more efficient.
- **Reverse Edges** – Usage information (incoming edges) is computed by scanning other nodes. Persisting reverse edges would avoid this costly traversal.
- **Edge Weights** – Attributes such as "uses", "triggers", or "calls" could be encoded as edge types or weights to capture richer semantics.

## Useful Algorithms

The current tool primarily performs tree/graph traversal. Additional algorithms could unlock deeper insights:

- **Topological Sort** – Order objects so dependencies are processed before dependents. Useful for deployment planning.
- **Strongly Connected Components** – Identify cycles in the schema which may indicate circular references.
- **Shortest Path / Reachability** – Determine if one object eventually depends on another and through which path.
- **Centrality Metrics** – Highlight heavily used tables or packages that form critical hubs.

## Expanding the Model

Introducing edges and applying graph algorithms would allow the analyzer to answer richer questions:

- What are the most frequently referenced tables?
- Which views depend on a given set of tables?
- How many hops separate two objects?

These capabilities can guide refactoring, performance tuning, and impact analysis when modifying database schemas.
