/**
 * Pure reasoning-effort helpers shared by the dashboard ReasoningPicker.
 *
 * Kept DOM-free so the node-environment vitest harness can cover the
 * resolution logic without loading React or the UI kit.
 *
 * Selectable values mirror Hermes' provider-style reasoning tags plus `none`
 * (thinking-off). Legacy values are accepted by normalizeEffort() for existing
 * configs but are not surfaced in the picker.
 */

export interface EffortOption {
  value: string;
  label: string;
}

export const EFFORT_OPTIONS: ReadonlyArray<EffortOption> = [
  { value: "none", label: "none" },
  { value: "minimal", label: "minimal" },
  { value: "low", label: "low" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
  { value: "xhigh", label: "xhigh" },
  { value: "max", label: "max" },
];

export const VALID_EFFORTS: ReadonlySet<string> = new Set(
  EFFORT_OPTIONS.map((o) => o.value),
);

/** Normalize a raw `agent.reasoning_effort` config value to a selectable
 *  option. Empty/unknown → `medium` (Hermes' default when unset). */
export function normalizeEffort(raw: unknown): string {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return "medium";
  const squashed = value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (squashed === "minimum") return "minimal";
  if (["xhigh", "x high", "extra high", "extra_high", "extra-high"].includes(squashed)) {
    return "xhigh";
  }
  if (["max", "maximum"].includes(squashed)) return "max";
  return VALID_EFFORTS.has(value) ? value : "medium";
}
