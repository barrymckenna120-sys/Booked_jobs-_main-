// Normalise a 360Messenger inbound webhook body. Supports both the legacy flat
// layout ({ dataType, From, Chat, Caption, createdAt }) and the current nested
// layout ({ event, createdAt, data: { from, body, timestamp } }).
export type InboundFields = {
  eventType: string | undefined;
  from: string;
  text: string | undefined;
  createdAt: string | undefined;
};

export function readInboundPayload(payload: any): InboundFields {
  const d = payload?.data ?? {};
  return {
    eventType: payload?.dataType ?? payload?.event,
    from: payload?.From ?? d?.from ?? "",
    text: payload?.Chat || payload?.Caption || d?.body || d?.caption || undefined,
    createdAt: payload?.createdAt ?? d?.timestamp,
  };
}
