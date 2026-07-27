import type { SpaRouterContractReport, SpaRouterRequestClassificationCounts } from "./spa-router.js";

const REQUEST_CLASSIFICATION_LABELS: Array<[keyof SpaRouterRequestClassificationCounts, string]> = [
  ["non-blocking-telemetry", "telemetry"],
  ["non-blocking-configured-host", "configuredHost"],
  ["blocking-required", "requiredObserved"],
  ["blocking-current-dom-image", "currentDomImage"],
  ["ignored-stale-image", "staleImageIgnored"],
];

function detailLines(prefix: string, details: string[], maxDetails: number): string[] {
  const shown = details.slice(0, maxDetails).map((detail) => `${prefix} ${detail}`);
  if (details.length > maxDetails) shown.push(`${prefix} ... omitted=${details.length - maxDetails}`);
  return shown;
}

/** Produces compact, auditable CLI diagnostics without changing the JSON report contract. */
export function formatSpaRouterVisualDiagnostics(report: SpaRouterContractReport, maxDetails = 8): string[] {
  if (!report.visualMatrix) return [];
  const lines = [
    `[INFO] visual stability phases: preAnchorWaitMs=${report.telemetry.visualPreAnchorWaitMs}，postAnchorWaitMs=${report.telemetry.visualPostAnchorWaitMs}`,
    `[INFO] visual requests: ${REQUEST_CLASSIFICATION_LABELS.map(([key, label]) => `${label}=${report.telemetry.visualRequestClassifications[key]}`).join("，")}`,
  ];
  for (const scenario of report.visualMatrix.scenarios) {
    for (const viewport of scenario.viewports) {
      const location = `scenario=${scenario.scenarioId} viewport=${viewport.id}`;
      lines.push(...detailLines(`[RESOURCE][REQUIRED] ${location}`, viewport.requiredNetworkFailureDetails, maxDetails));
      if (!viewport.passed) lines.push(...detailLines(`[RESOURCE][NON-BLOCKING] ${location}`, viewport.nonBlockingNetworkFailureDetails, maxDetails));
      lines.push(...detailLines(`[STABILITY] ${location}`, viewport.stabilityFailures, maxDetails));
      lines.push(...detailLines(`[CAPTURE] ${location}`, viewport.captureFailures, maxDetails));
    }
  }
  return lines;
}
