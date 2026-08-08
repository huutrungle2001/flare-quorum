function finiteNonNegativeNumber(value, code) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(code);
  }
  return value;
}

export function roundMilliseconds(value) {
  return Number(finiteNonNegativeNumber(value, "INGRESS_LATENCY_VALUE_INVALID").toFixed(3));
}

function summarize(values) {
  if (values.length === 0) throw new Error("INGRESS_LATENCY_SAMPLES_EMPTY");
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    minMs: roundMilliseconds(Math.min(...values)),
    maxMs: roundMilliseconds(Math.max(...values)),
    averageMs: roundMilliseconds(total / values.length),
  };
}

export function summarizeIngressTimings(timings) {
  if (!Array.isArray(timings) || timings.length === 0) {
    throw new Error("INGRESS_LATENCY_SAMPLES_INVALID");
  }
  const normalized = timings.map((sample) => ({
    machine: sample?.machine,
    directResponseMs: finiteNonNegativeNumber(sample?.directResponseMs, "INGRESS_DIRECT_LATENCY_INVALID"),
    resultResponseMs: finiteNonNegativeNumber(sample?.resultResponseMs, "INGRESS_RESULT_LATENCY_INVALID"),
    endToEndMs: finiteNonNegativeNumber(sample?.endToEndMs, "INGRESS_TOTAL_LATENCY_INVALID"),
  }));
  if (normalized.some(({ machine }) => !Number.isInteger(machine) || machine < 1)) {
    throw new Error("INGRESS_MACHINE_INDEX_INVALID");
  }
  return {
    sampleCount: normalized.length,
    samples: normalized.map((sample) => ({
      machine: sample.machine,
      directResponseMs: roundMilliseconds(sample.directResponseMs),
      resultResponseMs: roundMilliseconds(sample.resultResponseMs),
      endToEndMs: roundMilliseconds(sample.endToEndMs),
    })),
    directResponse: summarize(normalized.map(({ directResponseMs }) => directResponseMs)),
    resultResponse: summarize(normalized.map(({ resultResponseMs }) => resultResponseMs)),
    endToEnd: summarize(normalized.map(({ endToEndMs }) => endToEndMs)),
  };
}
