export type LayoutName = "dagre" | "cose-bilkent";

export function selectLayout(isDag: boolean): LayoutName {
  return isDag ? "dagre" : "cose-bilkent";
}
