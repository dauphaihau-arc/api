/** Default wall clock/scheduler; tests inject fakes. */
export function createTimerScheduler() {
  return {
    schedule(fn, delayMs) {
      return setTimeout(fn, delayMs);
    },
    cancel(handle) {
      clearTimeout(handle);
    },
  };
}
