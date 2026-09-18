/**
 * REQ-015: billing-grade usage metrics via CloudWatch Embedded Metric Format.
 * Each emit writes one console line that CloudWatch Lambda logs parse into a
 * custom metric — no SDK dependency, no extra network call.
 */

export function emitCountMetric(
  name: string,
  dimensions: Record<string, string>,
  value = 1,
): void {
  const keys = Object.keys(dimensions);
  const emf = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: 'SecureLinks',
          Dimensions: [keys],
          Metrics: [{ Name: name, Unit: 'Count' }],
        },
      ],
    },
    ...dimensions,
    [name]: value,
  };
  console.log(JSON.stringify(emf));
}
