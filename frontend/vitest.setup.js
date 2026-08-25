// Node 22+ ships an experimental global `localStorage`/`sessionStorage` (the
// Web Storage API) that is enabled by default in some Node builds (observed
// on Node v25.4.0 here). That built-in stub is not a functioning Storage
// implementation (e.g. it has no .clear()) and, because it is defined on
// globalThis before Vitest's jsdom environment is created, it shadows the
// real, fully-functional localStorage that jsdom provides — even though the
// property itself is technically configurable.
//
// This setup file runs after the jsdom environment is installed but before
// any test file executes, so we detect the broken stub and replace it with a
// real jsdom-backed Storage instance. On Node versions without the built-in
// (or where it isn't enabled), jsdom's own localStorage already works and
// this is a no-op.
import { JSDOM } from "jsdom";

if (typeof globalThis.localStorage === "undefined" || typeof globalThis.localStorage.clear !== "function") {
  const { localStorage } = new JSDOM("", { url: "http://localhost" }).window;
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorage,
    configurable: true,
    writable: true,
  });
}
