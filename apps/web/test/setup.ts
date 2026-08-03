import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value: vi.fn(),
  writable: true,
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(window.scrollTo).mockClear();
});
