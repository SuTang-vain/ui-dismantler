export interface NumericSummary {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  variance: number;
  standardDeviation: number;
  coefficientOfVariation: number;
}

function rounded(value: number): number {
  return Number(value.toFixed(3));
}

export function summarizeNumbers(values: number[]): NumericSummary {
  if (!values.length) throw new TypeError("summarizeNumbers requires at least one value");
  if (values.some((value) => !Number.isFinite(value))) throw new TypeError("summarizeNumbers only accepts finite values");
  const sorted = [...values].sort((left, right) => left - right);
  const count = sorted.length;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / count;
  const middle = Math.floor(count / 2);
  const median = count % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const variance = count > 1
    ? sorted.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (count - 1)
    : 0;
  const standardDeviation = Math.sqrt(variance);
  return {
    count,
    min: rounded(sorted[0]),
    max: rounded(sorted[count - 1]),
    mean: rounded(mean),
    median: rounded(median),
    variance: rounded(variance),
    standardDeviation: rounded(standardDeviation),
    coefficientOfVariation: rounded(mean === 0 ? 0 : standardDeviation / mean),
  };
}
