export function createExclusiveQueue<T>(): {
  run: (task: () => Promise<T>) => Promise<T>;
  readonly busy: boolean;
} {
  let current: Promise<T> | null = null;
  return {
    get busy() {
      return current !== null;
    },
    run(task) {
      if (current) return current;
      const started = task().finally(() => {
        current = null;
      });
      current = started;
      return started;
    },
  };
}
