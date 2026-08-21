import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { SnackRelease } from "../snackStore";
import {
  ReleaseTitle,
  releaseRefreshIntervalMs,
  startReleaseRefreshLifecycle,
} from "./HomeScreen";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

function release(id: string): SnackRelease {
  return {
    id,
    title: `Release ${id}`,
    brand: null,
    summary: null,
    articleUrl: null,
    publishedAt: "2026-08-20",
  };
}

function lifecycleHarness(load: () => Promise<SnackRelease[]>) {
  let visibility: DocumentVisibilityState = "visible";
  let intervalCallback: (() => void) | undefined;
  let visibilityCallback: (() => void) | undefined;
  const successes: SnackRelease[][] = [];
  const errors: unknown[] = [];
  let currentError: unknown;
  const clearedIntervals: number[] = [];
  const removedListeners: Array<() => void> = [];
  let scheduledDelay: number | undefined;

  const cleanup = startReleaseRefreshLifecycle({
    load,
    onSuccess: (releases) => {
      currentError = undefined;
      successes.push(releases);
    },
    onError: (error) => {
      currentError = error;
      errors.push(error);
    },
    getVisibilityState: () => visibility,
    setInterval: (callback, delay) => {
      intervalCallback = callback;
      scheduledDelay = delay;
      return 42;
    },
    clearInterval: (interval) => clearedIntervals.push(interval),
    addVisibilityListener: (callback) => { visibilityCallback = callback; },
    removeVisibilityListener: (callback) => removedListeners.push(callback),
  });

  return {
    cleanup,
    errors,
    successes,
    clearedIntervals,
    removedListeners,
    get intervalCallback() { return intervalCallback; },
    get visibilityCallback() { return visibilityCallback; },
    get scheduledDelay() { return scheduledDelay; },
    get currentError() { return currentError; },
    set visibility(value: DocumentVisibilityState) { visibility = value; },
  };
}

const linkedTitle = renderToStaticMarkup(
  <ReleaseTitle title="Cocoa-Dusted Almond Bites" articleUrl="https://example.com/snack" />,
);
assert.match(linkedTitle, /<h3><a href="https:\/\/example\.com\/snack" target="_blank" rel="noreferrer">Cocoa-Dusted Almond Bites<\/a><\/h3>/);

const plainTitle = renderToStaticMarkup(
  <ReleaseTitle title="Everything Hummus Snack Cups" articleUrl={null} />,
);
assert.equal(plainTitle, "<h3>Everything Hummus Snack Cups</h3>");

const firstRequest = deferred<SnackRelease[]>();
let overlapLoadCount = 0;
const overlapHarness = lifecycleHarness(() => {
  overlapLoadCount += 1;
  return firstRequest.promise;
});
assert.equal(overlapLoadCount, 1, "starts with an immediate release fetch");
assert.equal(overlapHarness.scheduledDelay, releaseRefreshIntervalMs, "refreshes every 15 minutes");
overlapHarness.intervalCallback?.();
overlapHarness.visibilityCallback?.();
assert.equal(overlapLoadCount, 1, "suppresses interval and visibility refreshes while one is pending");
firstRequest.resolve([release("first")]);
await settle();
assert.deepEqual(overlapHarness.successes, [[release("first")]]);

overlapHarness.visibility = "hidden";
overlapHarness.visibilityCallback?.();
assert.equal(overlapLoadCount, 1, "does not refresh while the page is hidden");
overlapHarness.visibility = "visible";
overlapHarness.visibilityCallback?.();
assert.equal(overlapLoadCount, 2, "refreshes when the page becomes visible");
await settle();

const transientError = new Error("temporary failure");
let recoveryLoadCount = 0;
const recoveryHarness = lifecycleHarness(async () => {
  recoveryLoadCount += 1;
  if (recoveryLoadCount === 1) throw transientError;
  return [release("recovered")];
});
await settle();
assert.deepEqual(recoveryHarness.errors, [transientError]);
assert.equal(recoveryHarness.currentError, transientError);
recoveryHarness.intervalCallback?.();
await settle();
assert.deepEqual(recoveryHarness.successes, [[release("recovered")]], "a later success recovers from an error");
assert.equal(recoveryHarness.currentError, undefined, "a successful refresh clears the previous error");

const pendingAfterCleanup = deferred<SnackRelease[]>();
let cleanupLoadCount = 0;
const cleanupHarness = lifecycleHarness(() => {
  cleanupLoadCount += 1;
  return pendingAfterCleanup.promise;
});
const staleIntervalCallback = cleanupHarness.intervalCallback;
const staleVisibilityCallback = cleanupHarness.visibilityCallback;
cleanupHarness.cleanup();
assert.deepEqual(cleanupHarness.clearedIntervals, [42]);
assert.deepEqual(cleanupHarness.removedListeners, [staleVisibilityCallback]);
pendingAfterCleanup.resolve([release("too-late")]);
await settle();
assert.deepEqual(cleanupHarness.successes, [], "does not write state after cleanup");
staleIntervalCallback?.();
staleVisibilityCallback?.();
assert.equal(cleanupLoadCount, 1, "cleanup prevents later scheduled fetches");

console.log("home screen tests passed");
