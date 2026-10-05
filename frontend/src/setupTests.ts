import "@testing-library/jest-dom/vitest";

declare global {
  interface Window {
    __TEST_ENV__: boolean;
  }
}

window.__TEST_ENV__ = true;
