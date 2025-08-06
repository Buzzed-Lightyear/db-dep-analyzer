import { performance } from "perf_hooks";
import { Command } from "commander";
import buildObjectStatistics from "./build";
import displayUsages from "./usages";

// ---------------------------------------------------------------------------
// Application entry point
// ---------------------------------------------------------------------------
//
// This file wires together the command line interface for the analyzer. The
// CLI exposes two commands:
//   * `build`  - parse CSV exports and produce `nodes.json` and summary CSVs
//   * `usages` - look up how a database object is referenced throughout the
//                graph produced by the build step
//
// Commander is used for argument parsing and dispatching. Each command delegates
// to a function in the corresponding module. A small `time` helper wraps command
// execution so that users receive basic performance feedback.

const program = new Command();

program
  .name("db-dependencies")
  .description("CLI to work with database object dependencies")
  .version("1.0.0");

// Build command -------------------------------------------------------------
//
// Parses the various CSV exports produced from an Oracle database and converts
// them into two artifacts:
//   * data/nodes.json      - a serialized dependency graph of all objects
//   * data/object_stats.csv - a flat summary used for additional analysis
//
// The heavy lifting is delegated to `buildObjectStatistics` in build.ts.
program
  .command("build")
  .description(
    "Builds the database object statistics CSV output file and associated data JSON file",
  )
  .action(async () => {
    await time(buildObjectStatistics);
  });

// Usages command ------------------------------------------------------------
//
// Given a database object (and optionally its type), print out where that object
// is referenced. A convenience format of `NAME+TYPE` is supported so that the
// type does not need to be passed as a separate argument.
program
  .command("usages <object> [type]")
  .description(
    'Display all of the usages of a given database object with optional type (supports "object+type" format)',
  )
  .action((object: string, type: string) => {
    // Allow users to pass "OBJECT+TYPE" as a single argument. If the "object"
    // parameter contains a plus sign we split the string and treat the second
    // half as the type. This mirrors the internal identifier format used
    // throughout the project.
    if (object.includes("+")) {
      [object, type] = object.split("+");
    }
    // Delegate to `displayUsages` which performs the heavy search work.
    time(displayUsages, object.toUpperCase(), type?.toUpperCase());
  });

program.parse();

// Utility to measure and log how long a given async function takes to run. The
// `Function` type is used here to remain flexible about the arguments passed in
// to the target function. In production code you might tighten this with a
// generic signature.
// eslint-disable-next-line @typescript-eslint/ban-types
async function time(func: Function, ...args: string[]) {
  const startTime = performance.now();
  await func(...args);
  const endTime = performance.now();
  console.log(`Completed in ${Math.round(endTime - startTime)} milliseconds`);
}
