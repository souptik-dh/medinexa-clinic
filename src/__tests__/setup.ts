import "@testing-library/jest-dom";
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";

// jsdom implements neither IndexedDB nor SubtleCrypto. fake-indexeddb/auto
// polyfills the former; Node's own webcrypto (spec-compliant) covers the
// latter so src/lib/secureStorage.ts can run under test the same way it
// does in a real browser.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}
