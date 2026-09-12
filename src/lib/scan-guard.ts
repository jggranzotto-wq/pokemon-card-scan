/** Drops stale identify/solds results after a newer scan starts. */
export function createScanGuard() {
  let current = 0;
  return {
    begin() {
      current += 1;
      return current;
    },
    isCurrent(id: number) {
      return id === current;
    },
  };
}
