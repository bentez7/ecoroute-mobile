let pendingDirectionsJson: Record<string, unknown> | null = null;

export function setPendingDirectionsJson(json: Record<string, unknown> | null) {
  pendingDirectionsJson = json;
}

export function consumePendingDirectionsJson(): Record<string, unknown> | null {
  const current = pendingDirectionsJson;
  pendingDirectionsJson = null;
  return current;
}
