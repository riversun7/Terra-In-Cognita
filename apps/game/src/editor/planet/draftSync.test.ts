// 서버 초안 동기화 시험 — 가짜 서버(판·기대 판 충돌)와 가짜 시계로: 열기, 2초 자동 저장, 보내는 저장 하나, 다시 시도(1초부터
// 두 배), 충돌(그쪽 불러오기·이걸로 덮기), 받지 않음, 되돌리기·지우기, 바로 저장, 읽기 실패, 버림
import { describe, expect, it } from "vitest";
import {
  AUTOSAVE_DELAY_MS,
  type DraftClient,
  type DraftSaveResult,
  type DraftTimers,
  type ServerDraft,
  createDraftSync,
  retryDelayMs,
} from "./draftSync.ts";
import { type DraftDocument, withSeed } from "./editorModel.ts";
import { TEST_PLANET } from "./testDefinitions.ts";

const PLANET = "s2_test_planet";
const BASE = { contentVersion: "core@2", definitionHash: "ab".repeat(32), generatorVersion: 1 };
const FALLBACK: DraftDocument = { entry: TEST_PLANET, base: BASE };
const doc = (seed: number): DraftDocument => ({ entry: withSeed(TEST_PLANET, seed), base: BASE });

/** 약속 사슬이 다 돌게 기다린다 */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** 가짜 시계: advance가 그 사이 타이머를 차례로 부른다 */
function fakeTimers() {
  let now = 0;
  let nextId = 0;
  const queue = new Map<number, { at: number; callback: () => void }>();
  const timers: DraftTimers = {
    after(ms, callback) {
      const id = nextId++;
      queue.set(id, { at: now + ms, callback });
      return () => {
        queue.delete(id);
      };
    },
    now: () => now,
  };
  const advance = async (ms: number): Promise<void> => {
    const end = now + ms;
    for (;;) {
      let due: [number, { at: number; callback: () => void }] | undefined;
      for (const item of queue) if (item[1].at <= end && (!due || item[1].at < due[1].at)) due = item;
      if (!due) break;
      queue.delete(due[0]);
      now = due[1].at;
      due[1].callback();
      await settle();
    }
    now = end;
    await settle();
  };
  return { timers, advance, pending: () => queue.size, now: () => now };
}

/** 가짜 서버: 판·기대 판 충돌을 흉내 낸다. fail로 닿지 못함을, hold로 답을 늦춘다 */
function fakeServer(initial: ServerDraft | null = null) {
  let draft = initial;
  let failures = 0;
  let held: (() => void)[] | null = null;
  const calls: string[] = [];
  const reply = <T>(work: () => T): Promise<T> => {
    if (failures > 0) {
      failures -= 1;
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    if (held) {
      const queue = held;
      return new Promise<T>((resolve) => queue.push(() => resolve(work())));
    }
    return Promise.resolve(work());
  };
  let rejectWith: string | null = null;
  const client: DraftClient = {
    get(planetId) {
      calls.push(`get ${planetId}`);
      return reply(() => draft);
    },
    save({ document, expectedRevision }) {
      calls.push(`save ${expectedRevision}`);
      return reply((): DraftSaveResult => {
        if (rejectWith) return { kind: "rejected", code: rejectWith };
        if ((draft?.revision ?? 0) !== expectedRevision) return { kind: "conflict" };
        const revision = expectedRevision + 1;
        draft = { revision, document, updatedAt: `t${revision}` };
        return { kind: "saved", revision, updatedAt: `t${revision}` };
      });
    },
    restore(_planetId, revision) {
      calls.push(`restore ${revision}`);
      return reply(() => {
        const next = (draft?.revision ?? 0) + 1;
        draft = { revision: next, document: doc(1000 + revision), updatedAt: `t${next}` };
        return draft;
      });
    },
    remove() {
      calls.push("remove");
      return reply(() => {
        draft = null;
      });
    },
    revisions() {
      calls.push("revisions");
      return reply(() => (draft ? [{ revision: draft.revision, savedAt: draft.updatedAt, bytes: 100 }] : []));
    },
  };
  return {
    client,
    calls,
    current: () => draft,
    /** 다른 기기의 저장 */
    saveElsewhere(document: DraftDocument) {
      const revision = (draft?.revision ?? 0) + 1;
      draft = { revision, document, updatedAt: `t${revision}` };
    },
    fail(count: number) {
      failures = count;
    },
    reject(code: string | null) {
      rejectWith = code;
    },
    hold() {
      held = [];
    },
    release() {
      const queue = held ?? [];
      held = null;
      for (const run of queue) run();
    },
  };
}

async function open(initial: ServerDraft | null = null) {
  const clock = fakeTimers();
  const server = fakeServer(initial);
  const sync = createDraftSync({
    planetId: PLANET,
    client: server.client,
    fallback: FALLBACK,
    timers: clock.timers,
  });
  sync.start();
  await settle();
  return { clock, server, sync, snapshot: () => sync.getSnapshot() };
}

describe("초안 열기", () => {
  it("서버에 초안이 없으면 공개본으로 시작(판 0, 저장할 것 없음)", async () => {
    const t = await open();
    expect(t.snapshot()).toMatchObject({ status: "saved", revision: 0, unsaved: false, document: FALLBACK });
    expect(t.server.calls).toEqual([`get ${PLANET}`]);
  });

  it("서버 초안이 있으면 그것을 편집한다", async () => {
    const t = await open({ revision: 3, document: doc(3), updatedAt: "t3" });
    expect(t.snapshot()).toMatchObject({ status: "saved", revision: 3, updatedAt: "t3", document: doc(3) });
  });

  it("읽지 못하면 다시 시도를 기다리고(읽기 전 편집은 받지 않는다) 1초 뒤 다시 읽는다", async () => {
    const clock = fakeTimers();
    const server = fakeServer();
    server.fail(1);
    const sync = createDraftSync({
      planetId: PLANET,
      client: server.client,
      fallback: FALLBACK,
      timers: clock.timers,
    });
    sync.start();
    await settle();
    expect(sync.getSnapshot()).toMatchObject({ status: "load_failed", failures: 1, retryAt: 1000 });
    expect(sync.edit(doc(1))).toBe(false);
    await clock.advance(1000);
    expect(sync.getSnapshot()).toMatchObject({ status: "saved", failures: 0 });
  });
});

describe("자동 저장", () => {
  it("마지막으로 바꾼 뒤 2초에 기대 판과 함께 저장한다", async () => {
    const t = await open();
    expect(t.sync.edit(doc(1))).toBe(true);
    expect(t.snapshot()).toMatchObject({ status: "pending", unsaved: true });
    await t.clock.advance(AUTOSAVE_DELAY_MS - 500);
    t.sync.edit(doc(2));
    await t.clock.advance(AUTOSAVE_DELAY_MS - 1);
    expect(t.server.calls).toEqual([`get ${PLANET}`]);
    await t.clock.advance(1);
    expect(t.server.calls.at(-1)).toBe("save 0");
    expect(t.snapshot()).toMatchObject({ status: "saved", revision: 1, unsaved: false });
    expect(t.server.current()?.document).toEqual(doc(2));
  });

  it("저장한 것으로 되돌리면 기다리던 저장을 지운다", async () => {
    const t = await open();
    t.sync.edit(doc(1));
    t.sync.edit(FALLBACK);
    expect(t.snapshot()).toMatchObject({ status: "saved", unsaved: false });
    expect(t.clock.pending()).toBe(0);
  });

  it("보내는 저장은 하나: 그동안 바꾼 것은 끝난 뒤 이어서(마지막 편집에서 2초)", async () => {
    const t = await open();
    t.sync.edit(doc(1));
    t.server.hold();
    await t.clock.advance(AUTOSAVE_DELAY_MS);
    expect(t.snapshot().status).toBe("saving");
    t.sync.edit(doc(2));
    await t.clock.advance(AUTOSAVE_DELAY_MS * 2);
    expect(t.server.calls.filter((call) => call.startsWith("save"))).toEqual(["save 0"]);
    t.server.release();
    await settle();
    // 마지막 편집에서 이미 2초가 지나 바로 다음 저장
    await t.clock.advance(0);
    expect(t.server.calls.filter((call) => call.startsWith("save"))).toEqual(["save 0", "save 1"]);
    expect(t.snapshot()).toMatchObject({ status: "saved", revision: 2, unsaved: false });
  });

  it("닿지 못하면 저장 안 됨: 1초·2초 뒤 가장 새 초안을 다시 보낸다", async () => {
    const t = await open();
    t.server.fail(2);
    t.sync.edit(doc(1));
    await t.clock.advance(AUTOSAVE_DELAY_MS);
    expect(t.snapshot()).toMatchObject({ status: "retrying", failures: 1, unsaved: true });
    expect(t.snapshot().retryAt).toBe(t.clock.now() + 1000);
    t.sync.edit(doc(2));
    await t.clock.advance(1000);
    expect(t.snapshot()).toMatchObject({ status: "retrying", failures: 2 });
    await t.clock.advance(2000);
    expect(t.snapshot()).toMatchObject({ status: "saved", failures: 0, revision: 1 });
    expect(t.server.current()?.document).toEqual(doc(2));
  });

  it("바로 저장(flush)은 기다리지 않는다", async () => {
    const t = await open();
    t.sync.edit(doc(4));
    await t.sync.flush();
    expect(t.snapshot()).toMatchObject({ status: "saved", revision: 1 });
    expect(t.clock.pending()).toBe(0);
  });

  it("다시 시도를 바로 할 수 있다", async () => {
    const t = await open();
    t.server.fail(1);
    t.sync.edit(doc(1));
    await t.clock.advance(AUTOSAVE_DELAY_MS);
    t.sync.retryNow();
    await settle();
    expect(t.snapshot()).toMatchObject({ status: "saved", revision: 1 });
  });

  it("서버가 받지 않으면 코드를 두고 멈춘다. 다시 바꾸면 다시 보낸다", async () => {
    const t = await open();
    t.server.reject("invalid_entry");
    t.sync.edit(doc(1));
    await t.clock.advance(AUTOSAVE_DELAY_MS);
    expect(t.snapshot()).toMatchObject({ status: "rejected", rejectedCode: "invalid_entry", unsaved: true });
    t.server.reject(null);
    t.sync.edit(doc(2));
    expect(t.snapshot()).toMatchObject({ status: "pending", rejectedCode: null });
    await t.clock.advance(AUTOSAVE_DELAY_MS);
    expect(t.snapshot()).toMatchObject({ status: "saved", revision: 1 });
  });
});

describe("충돌", () => {
  it("다른 기기가 먼저 저장했으면 충돌: 자동 저장을 멈추고, 그쪽 불러오기는 서버 것으로", async () => {
    const t = await open({ revision: 1, document: doc(1), updatedAt: "t1" });
    t.server.saveElsewhere(doc(9));
    t.sync.edit(doc(2));
    await t.clock.advance(AUTOSAVE_DELAY_MS);
    expect(t.snapshot()).toMatchObject({ status: "conflict", unsaved: true });
    t.sync.edit(doc(3));
    await t.clock.advance(AUTOSAVE_DELAY_MS * 3);
    expect(t.server.calls.filter((call) => call.startsWith("save"))).toEqual(["save 1"]);
    await expect(t.sync.loadTheirs()).resolves.toBe(true);
    expect(t.snapshot()).toMatchObject({ status: "saved", revision: 2, document: doc(9), unsaved: false });
  });

  it("이걸로 덮기: 서버의 지금 판을 기대 판으로 다시 저장한다", async () => {
    const t = await open({ revision: 1, document: doc(1), updatedAt: "t1" });
    t.server.saveElsewhere(doc(9));
    t.sync.edit(doc(2));
    await t.clock.advance(AUTOSAVE_DELAY_MS);
    await expect(t.sync.overwrite()).resolves.toBe(true);
    expect(t.snapshot()).toMatchObject({ status: "saved", revision: 3, document: doc(2) });
    expect(t.server.current()?.document).toEqual(doc(2));
  });
});

describe("판 기록", () => {
  it("되돌리기는 새 판, 지우기는 공개본으로", async () => {
    const t = await open({ revision: 4, document: doc(4), updatedAt: "t4" });
    t.sync.edit(doc(5));
    await expect(t.sync.restore(2)).resolves.toBe(true);
    expect(t.snapshot()).toMatchObject({ status: "saved", revision: 5, document: doc(1002), unsaved: false });
    expect(t.clock.pending()).toBe(0);
    await expect(t.sync.revisions()).resolves.toEqual([{ revision: 5, savedAt: "t5", bytes: 100 }]);
    await expect(t.sync.remove()).resolves.toBe(true);
    expect(t.snapshot()).toMatchObject({ status: "saved", revision: 0, document: FALLBACK, updatedAt: null });
  });

  it("실패하면 앞 상태로 돌아가 false, 남은 변경은 다시 자동 저장한다", async () => {
    const t = await open({ revision: 1, document: doc(1), updatedAt: "t1" });
    t.server.fail(1);
    await expect(t.sync.restore(1)).resolves.toBe(false);
    expect(t.snapshot()).toMatchObject({ status: "saved", revision: 1 });
    t.sync.edit(doc(2));
    t.server.fail(1);
    await expect(t.sync.remove()).resolves.toBe(false);
    expect(t.snapshot()).toMatchObject({ status: "pending", unsaved: true });
    await t.clock.advance(AUTOSAVE_DELAY_MS);
    expect(t.snapshot()).toMatchObject({ status: "saved", revision: 2 });
  });

  it("바쁜 동안의 편집과 겹친 바쁜 일은 받지 않는다", async () => {
    const t = await open({ revision: 1, document: doc(1), updatedAt: "t1" });
    t.server.hold();
    const restoring = t.sync.restore(1);
    await settle();
    expect(t.snapshot().status).toBe("busy");
    expect(t.sync.edit(doc(7))).toBe(false);
    await expect(t.sync.remove()).resolves.toBe(false);
    t.server.release();
    await expect(restoring).resolves.toBe(true);
  });
});

describe("버림·기다림 시간", () => {
  it("버리면 타이머를 지우고 더 알리지 않는다", async () => {
    const t = await open();
    let calls = 0;
    t.sync.subscribe(() => {
      calls += 1;
    });
    t.sync.edit(doc(1));
    expect(calls).toBe(1);
    t.sync.dispose();
    expect(t.clock.pending()).toBe(0);
    expect(t.sync.edit(doc(2))).toBe(false);
    expect(calls).toBe(1);
  });

  it("보내는 중에 버리면 답이 와도 더 보내지 않는다", async () => {
    const t = await open();
    t.sync.edit(doc(1));
    t.server.hold();
    await t.clock.advance(AUTOSAVE_DELAY_MS);
    t.sync.edit(doc(2));
    t.sync.dispose();
    t.server.release();
    await t.clock.advance(AUTOSAVE_DELAY_MS * 5);
    expect(t.server.calls.filter((call) => call.startsWith("save"))).toEqual(["save 0"]);
    expect(t.clock.pending()).toBe(0);
  });

  it("다시 시도 기다림: 1초부터 두 배, 최대 30초", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 50].map(retryDelayMs)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
    expect(retryDelayMs(0)).toBe(1000);
  });
});
