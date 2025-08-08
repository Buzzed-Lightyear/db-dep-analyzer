import { SplitPanel } from "@cloudscape-design/components";
import { useState, useEffect, useMemo, useRef } from "react";
import { DatabaseObject } from "../../utils/DataExtractor";
import ObjectDependencyGraph from "./ObjectDependencyGraph";
import ObjectTable from "./ObjectTable";
import DdaAppLayout from "../common/DdaAppLayout";
import ErrorBoundary from "../common/ErrorBoundary";
import useResizeObserver from "../../hooks/useResizeObserver";

export default function DatabaseObjects() {
  const splitPanelTopSpacing = 179; // size - 63 (header) - 3x20 (margins) - 56 (header)
  const [databaseObjects, setDatabaseObjects] = useState<
    DatabaseObject[] | undefined
  >();
  const [splitPanelOpen, setSplitPanelOpen] = useState(false);
  const [selectedObject, setSelectedObject] = useState<
    DatabaseObject | undefined
  >();
  const [splitPanelSize, setSplitPanelSize] = useState(0);
  const [windowResizing, setWindowResizing] = useState(false);
  const [parseMs, setParseMs] = useState(0);
  const splitPanelRef = useRef<HTMLDivElement>(null);
  const splitPanelRect = useResizeObserver(splitPanelRef);

  useEffect(() => {
    if (splitPanelRect) {
      setSplitPanelSize(splitPanelRect.height - splitPanelTopSpacing);
    }
  }, [splitPanelRect]);

  const databaseObjectParser = useMemo(
    () =>
      new Worker(
        new URL("../../workers/parse-database-objects.ts", import.meta.url),
      ),
    [],
  );

  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined;
    const handleResize = () => {
      clearTimeout(timeout);
      setWindowResizing(true);

      timeout = setTimeout(() => {
        setWindowResizing(false);
      }, 200);
    };
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("./visualization_data.json.gz");
        if (!response.ok) {
          throw new Error(`HTTP error: Status ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        databaseObjectParser.postMessage({ type: "parse", buffer: arrayBuffer });
      } catch (err) {
        console.error("Failed to fetch visualization_data", err);
      }
    };

    const handleMessage = (event: MessageEvent<any>) => {
      if (event.data.type === "parsed") {
        setDatabaseObjects(
          event.data.databaseObjects.map((dbObject: DatabaseObject) =>
            Object.setPrototypeOf(dbObject, DatabaseObject.prototype),
          ),
        );
        setParseMs(event.data.parseMs);
      }
    };

    databaseObjectParser.addEventListener("message", handleMessage);
    fetchData();
    return () =>
      databaseObjectParser.removeEventListener("message", handleMessage);
  }, [databaseObjectParser]);

  return (
    <DdaAppLayout
      contentType="table"
      content={
        <ObjectTable
          databaseObjects={databaseObjects}
          onObjectSelected={(dbObject) => {
            setSelectedObject(dbObject);
            if (dbObject) {
              setSplitPanelOpen(true);
            }
          }}
        />
      }
      splitPanelOpen={splitPanelOpen}
      onSplitPanelToggle={(event) => setSplitPanelOpen(event.detail.open)}
      splitPanel={
        <div ref={splitPanelRef}>
          <SplitPanel
            header={selectedObject?.title ?? "No Object Selected"}
            hidePreferencesButton={true}
            closeBehavior="hide"
          >
            {selectedObject ? (
              <ErrorBoundary>
                <ObjectDependencyGraph
                  worker={databaseObjectParser}
                  parseMs={parseMs}
                  databaseObject={selectedObject}
                  splitPanelSize={splitPanelSize}
                  windowResizing={windowResizing}
                />
              </ErrorBoundary>
            ) : (
              "Select an object to view its details"
            )}
          </SplitPanel>
        </div>
      }
    />
  );
}
