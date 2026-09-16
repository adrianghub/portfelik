import { describe, expect, it } from "vitest";
import {
  consumeDemoRequest,
  finishDemoRequest,
  requestDemo,
  type DemoRequestState,
} from "$lib/guided-tour/demo-request";
import { createExclusiveQueue } from "$lib/concurrency";

function idle(): DemoRequestState {
  return { nonce: 0, userId: null, busy: false };
}

describe("demo seed request", () => {
  it("scopes a request to the signed-in user and marks it busy", () => {
    const next = requestDemo(idle(), "user-a");
    expect(next).toEqual({ nonce: 1, userId: "user-a", busy: true });
  });

  it("ignores another click while a seed is already busy", () => {
    const first = requestDemo(idle(), "user-a");
    const second = requestDemo(first, "user-a");
    expect(second).toEqual(first);
  });

  it("does not request without a user id", () => {
    expect(requestDemo(idle(), null)).toEqual(idle());
  });

  it("consumes the nonce so a remounted host cannot replay it", () => {
    const requested = requestDemo(idle(), "user-a");
    const first = consumeDemoRequest(requested, "user-a");
    expect(first.shouldSeed).toBe(true);
    expect(first.state.nonce).toBe(0);
    expect(first.state.userId).toBeNull();
    expect(first.state.busy).toBe(true);

    const remount = consumeDemoRequest(first.state, "user-a");
    expect(remount.shouldSeed).toBe(false);
    expect(remount.state.nonce).toBe(0);
  });

  it("discards a leftover request instead of seeding another user's account", () => {
    const leftover = requestDemo(idle(), "user-a");
    const nextUser = consumeDemoRequest(leftover, "user-b");
    expect(nextUser.shouldSeed).toBe(false);
    expect(nextUser.state).toEqual(idle());
  });

  it("discards a leftover request when the next session has no user yet", () => {
    const leftover = requestDemo(idle(), "user-a");
    const signedOut = consumeDemoRequest(leftover, null);
    expect(signedOut.shouldSeed).toBe(false);
    expect(signedOut.state).toEqual(idle());
  });

  it("clears busy when the seed finishes", () => {
    const seeded = consumeDemoRequest(requestDemo(idle(), "user-a"), "user-a");
    expect(finishDemoRequest(seeded.state)).toEqual(idle());
  });
});

describe("exclusive seed queue", () => {
  it("shares one in-flight task instead of starting a second seed", async () => {
    const queue = createExclusiveQueue<string>();
    let starts = 0;
    let release!: (value: string) => void;
    const first = queue.run(
      () =>
        new Promise<string>((resolve) => {
          starts += 1;
          release = resolve;
        })
    );
    const second = queue.run(async () => {
      starts += 1;
      return "second";
    });
    expect(queue.busy).toBe(true);
    expect(starts).toBe(1);
    release("first");
    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("first");
    expect(queue.busy).toBe(false);

    const third = queue.run(async () => {
      starts += 1;
      return "third";
    });
    await expect(third).resolves.toBe("third");
    expect(starts).toBe(2);
  });
});
