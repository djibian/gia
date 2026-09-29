export type OperationalEventCode =
  | "rate_limited"
  | "oauth_rejected"
  | "oauth_jwks_unavailable"
  | "grist_credential_resolution_failed"
  | "mcp_internal_error";

export interface OperationalEvent {
  type: "grist.ops";
  timestamp: string;
  event: OperationalEventCode;
  count: number;
}

/**
 * Emits low-cardinality, secret-free operational events suitable for an
 * external log/alert pipeline. Counters are process-local and intentionally
 * reset on restart; durable aggregation belongs to deployment infrastructure.
 */
export class OperationalEventLogger {
  private readonly counts = new Map<OperationalEventCode, number>();

  constructor(
    private readonly sink: (line: string) => void = console.log,
    private readonly now: () => Date = () => new Date()
  ) {}

  record(event: OperationalEventCode): OperationalEvent {
    const count = (this.counts.get(event) ?? 0) + 1;
    this.counts.set(event, count);
    const payload: OperationalEvent = {
      type: "grist.ops",
      timestamp: this.now().toISOString(),
      event,
      count
    };
    this.sink(JSON.stringify(payload));
    return payload;
  }
}
