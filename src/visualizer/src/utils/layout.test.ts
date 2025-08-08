import { selectLayout } from "./layout";

test("selectLayout returns dagre for DAG", () => {
  expect(selectLayout(true)).toBe("dagre");
});

test("selectLayout returns cose-bilkent for general graph", () => {
  expect(selectLayout(false)).toBe("cose-bilkent");
});
