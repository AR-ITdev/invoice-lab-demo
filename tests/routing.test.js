import test from "node:test";
import assert from "node:assert/strict";
import { PAGE_PATHS, parseRoute, routePath } from "../src/lib/routing.js";

test("main pages have distinct paths, including home regardless of stored project", () => {
  for (const [page, path] of Object.entries(PAGE_PATHS)) {
    assert.equal(routePath({ page }), path);
    assert.equal(parseRoute(path).page, page);
    assert.equal(parseRoute(`${path}/`).page, page);
  }
});

test("invoice selection and workspace survive route round trips", () => {
  for (const view of ["main", "trace", "document"]) {
    const path = routePath({ page: "documents", documentId: "vim-01", view });
    assert.deepEqual(parseRoute(path), { page: "documents", documentId: "vim-01", view });
  }
  const path = routePath({ page: "documents", documentId: "id / à" });
  assert.equal(parseRoute(path).documentId, "id / à");
});

test("rule editor and VIM association have addressable routes", () => {
  assert.equal(routePath({ page: "rules", column: "AA" }), "/regole/AA");
  assert.deepEqual(parseRoute("/regole/AA"), { page: "rules", column: "AA" });
  const url = new URL(routePath({ page: "vim", link: "xml:xml-01" }), "https://demo.example");
  assert.deepEqual(parseRoute(url.pathname, url.search), { page: "vim", link: "xml:xml-01" });
});

test("unknown paths and malformed document IDs are explicit not-found routes", () => {
  for (const path of ["/wrong", "/fatture/id/unknown", "/regole/AA/other", "/fatture/%ZZ"]) {
    assert.equal(parseRoute(path).page, "not-found", path);
  }
  assert.throws(() => routePath({ page: "unknown" }), /non riconosciuta/);
});
