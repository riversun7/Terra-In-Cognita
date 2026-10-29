// 미리보기 관리자 시험 — 가짜 워커로: 열 때 순서, 줄마다 하나 + 기다림, 낡은 본 일(기후 전 다시 띄움), 결과 기억·고정·F9 버림,
// 꺼짐 감지 표시, 워커 죽음·못 씀, 멈춤, 입력 틀림. 결과는 가짜(관리자는 면 레벨·해시·바이트만 읽는다)
import { PLANET_GENERATOR_FACE_LEVELS } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { withSeed, withSetting } from "./editorModel.ts";
import { controllerKit as setup } from "./previewTestKit.ts";
import { TEST_PLANET, definitionOf } from "./testDefinitions.ts";

const HIGHEST = PLANET_GENERATOR_FACE_LEVELS[1];
const BASE = definitionOf(TEST_PLANET);
const DRAFT = definitionOf(withSetting(TEST_PLANET, "landPercent", 40));
const OTHER = definitionOf(withSeed(TEST_PLANET, 7));

describe("미리보기 관리자: 열기", () => {
  it("빠른 줄 공개본 F5 → 본 줄 초안 F7, 공개본 F7은 뒤에 선다", () => {
    const t = setup();
    t.controller.open(BASE, DRAFT);
    const snapshot = t.controller.getSnapshot();
    expect(snapshot.levels.cap).toBe(HIGHEST);
    expect(snapshot.finalLevel).toBe(7);
    expect(t.workers).toHaveLength(2);
    expect(t.last(t.workerAt(5)).input.faceLevel).toBe(5);
    expect(snapshot.base.quick.status).toBe("running");
    expect(snapshot.draft.final.status).toBe("running");
    expect(snapshot.base.final.status).toBe("queued");
    expect(snapshot.lanes.final.waiting).toBe(1);
    expect(snapshot.lanes.final.running?.role).toBe("draft");
    // 본 줄 초안 결과가 오면 공개본 F7을 보낸다
    const final = t.workerAt(7);
    const draftJob = t.finish(final);
    expect(final.posted).toHaveLength(2);
    expect(t.last(final).key).not.toBe(draftJob.key);
    t.finish(final);
    t.finish(t.workerAt(5));
    const done = t.controller.getSnapshot();
    expect(done.base.quick.status).toBe("ready");
    expect(done.draft.final).toMatchObject({ status: "ready", current: true });
    expect(done.base.final).toMatchObject({ status: "ready", current: true });
    expect(done.lanes.final.running).toBeNull();
  });

  it("초안이 공개본과 같으면 본 줄 일은 하나", () => {
    const t = setup();
    t.controller.open(BASE, BASE);
    expect(t.controller.getSnapshot().lanes.final.waiting).toBe(0);
    t.finish(t.workerAt(7));
    const snapshot = t.controller.getSnapshot();
    expect(snapshot.base.final.entry).toBe(snapshot.draft.final.entry);
  });

  it("기기 상한과 정의 면 레벨을 넘지 않는다", () => {
    const t = setup({ deviceMaxLevel: 8 });
    t.controller.open(BASE, DRAFT);
    t.controller.setFinalLevel(HIGHEST);
    expect(t.controller.getSnapshot().finalLevel).toBe(8);
    const small = setup();
    small.controller.open(
      definitionOf({ ...TEST_PLANET, faceLevel: 6 }),
      definitionOf({ ...TEST_PLANET, faceLevel: 6 }),
    );
    expect(small.controller.getSnapshot().levels).toMatchObject({ cap: 6, quick: 5, finalDefault: 6 });
  });
});

describe("미리보기 관리자: 줄과 낡은 일", () => {
  it("빠른 줄: 도는 일은 끝까지, 기다리는 일은 가장 새 것 하나", () => {
    const t = setup();
    t.controller.open(BASE, BASE);
    const quick = t.workerAt(5);
    t.controller.setDraft(DRAFT, "quick");
    t.controller.setDraft(OTHER, "quick");
    expect(quick.posted).toHaveLength(1);
    expect(t.controller.getSnapshot().lanes.quick.waiting).toBe(1);
    t.finish(quick);
    expect(quick.posted).toHaveLength(2);
    t.finish(quick);
    const snapshot = t.controller.getSnapshot();
    expect(snapshot.draft.quick).toMatchObject({ status: "ready", current: true });
    expect(t.controller.lookup(OTHER, 5)).toBeDefined();
    expect(t.controller.lookup(DRAFT, 5)).toBeUndefined();
  });

  it("본 줄: 기후 전이면 워커를 끝내고 새 워커로 새 일을 바로 보낸다", () => {
    const t = setup();
    t.controller.open(BASE, DRAFT);
    const first = t.workerAt(7);
    t.stage(first, "tectonics");
    t.controller.setDraft(OTHER, "final");
    expect(first.terminated).toBe(true);
    const second = t.workerAt(7);
    expect(second).not.toBe(first);
    expect(t.controller.getSnapshot().lanes.final.running?.stage).toBeNull();
    // 끝낸 워커의 늦은 답은 버린다
    t.finish(first);
    expect(t.controller.lookup(DRAFT, 7)).toBeUndefined();
  });

  it("본 줄: 기후를 지났으면 끝까지 두고 결과는 기억만 한다(보이는 것은 그대로)", () => {
    const t = setup();
    t.controller.open(BASE, DRAFT);
    const final = t.workerAt(7);
    t.stage(final, "climate");
    t.controller.setDraft(OTHER, "final");
    expect(final.terminated).toBe(false);
    t.finish(final);
    expect(t.controller.lookup(DRAFT, 7)).toBeDefined();
    let snapshot = t.controller.getSnapshot();
    expect(snapshot.draft.final).toMatchObject({ status: "running", entry: null, current: false });
    // 새 초안 일이 먼저, 공개본 일은 그 뒤
    expect(snapshot.lanes.final.running?.role).toBe("draft");
    t.finish(final);
    snapshot = t.controller.getSnapshot();
    expect(snapshot.draft.final).toMatchObject({ status: "ready", current: true });
    expect(snapshot.lanes.final.running?.role).toBe("base");
  });

  it("기억한 결과로 돌아가면 바로 보이고, 기후 전 낡은 일은 끝낸다", () => {
    const t = setup();
    t.controller.open(BASE, BASE);
    t.finish(t.workerAt(7));
    t.controller.setDraft(DRAFT, "final");
    const running = t.workerAt(7);
    t.controller.setDraft(BASE, "final");
    expect(running.terminated).toBe(true);
    const snapshot = t.controller.getSnapshot();
    expect(snapshot.draft.final).toMatchObject({ status: "ready", current: true });
    expect(snapshot.lanes.final.running).toBeNull();
  });

  it("본 줄 레벨을 바꾸면 그 레벨로 청하고(F8 이상은 공개본을 미룬다) 꺼짐 감지 표시를 남긴다", () => {
    const t = setup();
    t.controller.open(BASE, BASE);
    t.finish(t.workerAt(7));
    t.controller.setFinalLevel(HIGHEST);
    expect(t.sentinel).toEqual(["begin 7", "end", `begin ${HIGHEST}`]);
    t.finish(t.workerAt(HIGHEST));
    expect(t.sentinel.at(-1)).toBe("end");
    expect(t.controller.getSnapshot().draft.final).toMatchObject({ status: "ready", level: HIGHEST });
  });

  it("멈추면 워커를 끝내고 표시를 지우며 멈춤 상태가 된다. 같은 레벨을 다시 고르면 다시 청한다", () => {
    const t = setup();
    t.controller.open(BASE, DRAFT);
    t.controller.setFinalLevel(HIGHEST);
    const running = t.workerAt(HIGHEST);
    t.controller.cancelFinal();
    expect(running.terminated).toBe(true);
    expect(t.sentinel.at(-1)).toBe("end");
    const snapshot = t.controller.getSnapshot();
    expect(snapshot.draft.final.status).toBe("cancelled");
    expect(snapshot.lanes.final).toEqual({ running: null, waiting: 0 });
    t.controller.setFinalLevel(HIGHEST);
    expect(t.workerAt(HIGHEST).posted).toHaveLength(1);
  });
});

describe("미리보기 관리자: 결과 기억", () => {
  it("상한을 넘으면 오래된 것부터 버리고 공개본·보이는 결과는 남긴다", () => {
    const t = setup({ cacheBytes: 2500 });
    t.controller.open(BASE, BASE);
    t.finish(t.workerAt(5));
    t.finish(t.workerAt(7));
    for (const definition of [DRAFT, OTHER]) {
      t.controller.setDraft(definition, "quick");
      t.finish(t.workerAt(5));
    }
    // 공개본 F5·F7 + 보이는 초안 빠른 결과(OTHER)가 남고 DRAFT 빠른 결과는 버린다
    expect(t.controller.lookup(BASE, 5)).toBeDefined();
    expect(t.controller.lookup(BASE, 7)).toBeDefined();
    expect(t.controller.lookup(OTHER, 5)).toBeDefined();
    expect(t.controller.lookup(DRAFT, 5)).toBeUndefined();
    expect(t.controller.getSnapshot().cacheBytes).toBe(3000);
  });

  it("F9 결과는 다음 본 결과가 오면 버린다", () => {
    const t = setup();
    t.controller.open(BASE, BASE);
    t.finish(t.workerAt(7));
    t.controller.setFinalLevel(HIGHEST);
    t.finish(t.workerAt(HIGHEST));
    t.controller.setDraft(DRAFT, "final");
    t.finish(t.workerAt(HIGHEST));
    // 공개본 F9(초안 = 공개본일 때 만든 것)는 공개본 자리 열쇠라 고정으로 남고, 초안 F9가 보인다
    expect(t.controller.lookup(BASE, HIGHEST)).toBeDefined();
    expect(t.controller.lookup(DRAFT, HIGHEST)).toBeDefined();
    t.controller.setDraft(OTHER, "final");
    t.finish(t.workerAt(HIGHEST));
    expect(t.controller.lookup(DRAFT, HIGHEST)).toBeUndefined();
    // F7로 돌아가면: 고정이 풀린 공개본 F9는 버리고, 보이는 초안 F9는 초안 F7이 올 때까지 남는다
    t.controller.setFinalLevel(7);
    expect(t.controller.lookup(BASE, HIGHEST)).toBeUndefined();
    expect(t.controller.lookup(OTHER, HIGHEST)).toBeDefined();
    t.finish(t.workerAt(7));
    expect(t.controller.lookup(OTHER, HIGHEST)).toBeUndefined();
    expect(t.controller.lookup(BASE, 7)).toBeDefined();
  });

  it("이 정의로 만든 결과의 해시(면 레벨 오름차순)와 걸린 시간", () => {
    const t = setup();
    t.controller.open(BASE, BASE);
    t.tick(250);
    t.finish(t.workerAt(7));
    t.finish(t.workerAt(5));
    expect(t.controller.checks(BASE)).toEqual([
      { faceLevel: 5, hash: "00000005" },
      { faceLevel: 7, hash: "00000007" },
    ]);
    expect(t.controller.checks(DRAFT)).toEqual([]);
    expect(t.controller.getSnapshot().draft.final.entry?.elapsedMs).toBe(250);
  });
});

describe("미리보기 관리자: 실패", () => {
  it("워커 실패 답은 그 자리의 실패, 다음 일은 계속한다", () => {
    const t = setup();
    t.controller.open(BASE, DRAFT);
    const final = t.workerAt(7);
    const request = t.last(final);
    final.handlers.onReply({ kind: "error", id: request.id, key: request.key, code: "failed", message: "x" });
    const snapshot = t.controller.getSnapshot();
    expect(snapshot.draft.final).toMatchObject({ status: "failed", error: "failed" });
    expect(snapshot.lanes.final.running?.role).toBe("base");
  });

  it("워커가 죽으면 crashed, 다음 일은 새 워커로", () => {
    const t = setup();
    t.controller.open(BASE, DRAFT);
    const final = t.workerAt(7);
    t.stage(final, "grid");
    final.handlers.onCrash();
    const snapshot = t.controller.getSnapshot();
    expect(snapshot.draft.final).toMatchObject({ status: "failed", error: "crashed" });
    expect(snapshot.available).toBe(true);
    const next = t.workerAt(7);
    expect(next).not.toBe(final);
    expect(snapshot.lanes.final.running?.role).toBe("base");
  });

  it("답 한 번 없이 두 번 잇달아 죽으면 워커를 못 쓴다", () => {
    const t = setup();
    t.controller.open(BASE, DRAFT);
    t.workerAt(7).handlers.onCrash();
    expect(t.controller.getSnapshot().available).toBe(true);
    t.workerAt(7).handlers.onCrash();
    const snapshot = t.controller.getSnapshot();
    expect(snapshot.available).toBe(false);
    expect(t.workers.every((worker) => worker.terminated)).toBe(true);
    expect(snapshot.base.quick.error).toBe("unavailable");
    t.controller.setDraft(OTHER, "final");
    expect(t.controller.getSnapshot().draft.final.error).toBe("unavailable");
  });

  it("워커를 만들 수 없으면 미리보기를 만들지 않는다", () => {
    const t = setup({ failCreate: true });
    t.controller.open(BASE, DRAFT);
    const snapshot = t.controller.getSnapshot();
    expect(snapshot.available).toBe(false);
    expect(snapshot.base.quick.error).toBe("unavailable");
    expect(snapshot.draft.final.error).toBe("unavailable");
  });

  it("생성기가 받지 않는 초안은 보내지 않고 rejected", () => {
    const t = setup();
    t.controller.open(BASE, BASE);
    const posted = t.workers.reduce((count, worker) => count + worker.posted.length, 0);
    t.controller.setDraft(definitionOf({ ...TEST_PLANET, seed: -1 }), "final");
    expect(t.controller.getSnapshot().draft.final).toMatchObject({ status: "failed", error: "rejected" });
    expect(t.workers.reduce((count, worker) => count + worker.posted.length, 0)).toBe(posted);
  });

  it("버리면 워커를 끝내고 표시를 지운다. 그 뒤 부름은 아무것도 하지 않는다", () => {
    const t = setup();
    t.controller.open(BASE, DRAFT);
    let calls = 0;
    t.controller.subscribe(() => {
      calls += 1;
    });
    t.controller.dispose();
    expect(t.workers.every((worker) => worker.terminated)).toBe(true);
    expect(t.sentinel).toEqual(["begin 7", "end"]);
    t.controller.setDraft(OTHER, "final");
    expect(calls).toBe(0);
  });
});
