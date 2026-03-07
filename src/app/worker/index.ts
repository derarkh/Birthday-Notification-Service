export async function startWorker(): Promise<void> {
  // Slice 1 placeholder for worker runtime entrypoint.
  // Worker behavior will be implemented in later slices.
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void startWorker();
}
