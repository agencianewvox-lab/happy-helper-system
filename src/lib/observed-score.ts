// Missing observations are not neutral scores. Zero is a real observation.
export function observedAverage(values: (number | null | undefined)[]): number | null {
  const observed = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return observed.length ? Number((observed.reduce((sum, value) => sum + value, 0) / observed.length).toFixed(1)) : null;
}
