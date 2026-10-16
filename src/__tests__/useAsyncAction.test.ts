import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAsyncAction, useKeyedAction, useLatestRequest } from "@/hooks/useAsyncAction";

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useAsyncAction", () => {
  it("runs once and ignores repeated calls while pending", async () => {
    const { result } = renderHook(() => useAsyncAction());
    const d = deferred<string>();
    const fn = vi.fn(() => d.promise);

    let first!: Promise<string | undefined>;
    let second!: Promise<string | undefined>;
    act(() => {
      // Same tick, before any re-render - a double-click.
      first = result.current.run(fn);
      second = result.current.run(fn);
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(true);
    await expect(second).resolves.toBeUndefined();

    await act(async () => {
      d.resolve("ok");
      await first;
    });
    await expect(first).resolves.toBe("ok");
    expect(result.current.pending).toBe(false);
  });

  it("releases the lock and re-throws when the request fails", async () => {
    const { result } = renderHook(() => useAsyncAction());
    const err = new Error("boom");

    await act(async () => {
      await expect(result.current.run(() => Promise.reject(err))).rejects.toBe(err);
    });
    expect(result.current.pending).toBe(false);

    // Retry is allowed after a failure.
    const fn = vi.fn(() => Promise.resolve(1));
    await act(async () => {
      await result.current.run(fn);
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("useKeyedAction", () => {
  it("tracks pending state per key independently", async () => {
    const { result } = renderHook(() => useKeyedAction<string>());
    const a = deferred();
    const b = deferred();
    const fnA = vi.fn(() => a.promise);

    let pa!: Promise<unknown>;
    let pb!: Promise<unknown>;
    act(() => {
      pa = result.current.run("a", fnA);
      result.current.run("a", fnA); // duplicate for the same row is ignored
      pb = result.current.run("b", () => b.promise);
    });

    expect(fnA).toHaveBeenCalledTimes(1);
    expect(result.current.isPending("a")).toBe(true);
    expect(result.current.isPending("b")).toBe(true);
    expect(result.current.isPending("c")).toBe(false);

    await act(async () => {
      a.resolve();
      await pa;
    });
    expect(result.current.isPending("a")).toBe(false);
    expect(result.current.isPending("b")).toBe(true);
    expect(result.current.anyPending).toBe(true);

    await act(async () => {
      b.reject(new Error("fail"));
      await pb.catch(() => {});
    });
    expect(result.current.isPending("b")).toBe(false);
    expect(result.current.anyPending).toBe(false);
  });
});

describe("useLatestRequest", () => {
  it("only reports the most recent token as latest", () => {
    const { result } = renderHook(() => useLatestRequest());
    const t1 = result.current.begin();
    const t2 = result.current.begin();
    expect(result.current.isLatest(t1)).toBe(false);
    expect(result.current.isLatest(t2)).toBe(true);
  });
});
