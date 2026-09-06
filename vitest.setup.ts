import "fake-indexeddb/auto";

// Node test env has no localStorage — the pomodoro engine persists its active
// session there. Provide a minimal in-memory shim (only when absent).
if (typeof globalThis.localStorage === "undefined") {
  let store: Record<string, string> = {};
  const shim = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: shim, configurable: true });
}
