import { describe, it, expect } from "vitest";
import {
  EFFORT_OPTIONS,
  VALID_EFFORTS,
  normalizeEffort,
} from "./reasoning-effort";

describe("normalizeEffort", () => {
  it("treats empty/unset as the Hermes default (medium)", () => {
    expect(normalizeEffort("")).toBe("medium");
    expect(normalizeEffort(null)).toBe("medium");
    expect(normalizeEffort(undefined)).toBe("medium");
    expect(normalizeEffort("   ")).toBe("medium");
  });

  it("passes through every provider-style effort level plus thinking-off", () => {
    for (const level of ["none", "minimal", "low", "medium", "high", "xhigh", "max"]) {
      expect(normalizeEffort(level)).toBe(level);
    }
  });

  it("normalizes legacy aliases to raw provider tags", () => {
    expect(normalizeEffort("  XHigh  ")).toBe("xhigh");
    expect(normalizeEffort("extra_high")).toBe("xhigh");
    expect(normalizeEffort("extra high")).toBe("xhigh");
    expect(normalizeEffort("maximum")).toBe("max");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(normalizeEffort("HIGH")).toBe("high");
    expect(normalizeEffort("  Extra High  ")).toBe("xhigh");
  });

  it("falls back to medium for unknown values", () => {
    expect(normalizeEffort("turbo")).toBe("medium");
    expect(normalizeEffort(42)).toBe("medium");
  });
});

describe("EFFORT_OPTIONS", () => {
  it("every option value is in VALID_EFFORTS (no orphan labels)", () => {
    for (const opt of EFFORT_OPTIONS) {
      expect(VALID_EFFORTS.has(opt.value)).toBe(true);
    }
  });

  it("surfaces only thinking-off plus raw provider-style effort tags", () => {
    expect(EFFORT_OPTIONS).toEqual([
      { value: "none", label: "none" },
      { value: "minimal", label: "minimal" },
      { value: "low", label: "low" },
      { value: "medium", label: "medium" },
      { value: "high", label: "high" },
      { value: "xhigh", label: "xhigh" },
      { value: "max", label: "max" },
    ]);
  });
});
