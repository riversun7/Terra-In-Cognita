// 미리보기 관리자 줄 시험(검토 지적) — 공개본 청이 초안 일에 합쳐졌다가 그 일이 밀려나도 공개본 결과를 잃지 않음,
// 원하지 않게 된 공개본 일·틀린 초안의 일은 기후 전이면 끝냄, 새 초안 일이 공개본 일보다 먼저, 무거운 레벨(F8·F9)의
// 공개본은 화면이 청할 때만, 버린 F9의 해시도 내보내기 checks에 남음, 버림 뒤 결과를 붙잡지 않음.
// 끝에 무작위 차례 시험: 고정 시드로 조작을 섞고, 줄을 다 비운 뒤 청한 자리가 모두 끝 상태인지 본다.
import { PLANET_GENERATOR_FACE_LEVELS } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { withPreset, withSeed, withSetting } from "./editorModel.ts";
import type { PreviewStage } from "./previewProtocol.ts";
import { type FakeWorker, controllerKit as setup } from "./previewTestKit.ts";
import type { PreviewLane } from "./previewJobs.ts";
import { TEST_PLANET, definitionOf } from "./testDefinitions.ts";

const HIGHEST = PLANET_GENERATOR_FACE_LEVELS[1];
const BASE = definitionOf(TEST_PLANET);
const DRAFT = definitionOf(withSetting(TEST_PLANET, "landPercent", 40));
const OTHER = definitionOf(withSeed(TEST_PLANET, 7));
const TAPPED = definitionOf(withPreset(TEST_PLANET, "seaLevel", "continent"));
const INVALID = definitionOf({ ...TEST_PLANET, seed: -1 });

describe("공개본 결과를 잃지 않는다", () => {
  it("초안 = 공개본으로 열고(서버 초안 없음) 기후 전에 프리셋을 누르면 공개본 F7을 그 뒤에 다시 만든다", () => {
    const t = setup();
    t.controller.open(BASE, BASE);
    const first = t.workerAt(7);
    t.stage(first, "grid");
    t.stage(first, "tectonics");
    t.controller.setDraft(TAPPED, "final");
    expect(first.terminated).toBe(true);
    expect(t.controller.getSnapshot().lanes.final.waiting).toBe(1);
    t.drain();
    const snapshot = t.controller.getSnapshot();
    expect(snapshot.draft.final).toMatchObject({ status: "ready", current: true });
    expect(snapshot.base.final).toMatchObject({ status: "ready", current: true });
    expect(t.controller.lookup(BASE, 7)).toBeDefined();
  });

  it("빠른 줄: 기다리던 초안 일에 합쳐진 공개본 F5도 새 끌기에 밀려 사라지지 않는다", () => {
    const t = setup();
    t.controller.open(BASE, BASE);
    t.controller.setDraft(DRAFT, "quick");
    // 공개본을 DRAFT로 다시 연다: 공개본 F5 청이 기다리던 초안 일(같은 열쇠)에 합쳐진다
    t.controller.open(DRAFT, DRAFT);
    t.controller.setDraft(OTHER, "quick");
    t.drain();
    const snapshot = t.controller.getSnapshot();
    expect(snapshot.base.quick).toMatchObject({ status: "ready", current: true });
    expect(snapshot.draft.quick).toMatchObject({ status: "ready", current: true });
  });

  it("새 초안 일은 기후 전의 공개본 일보다 먼저 돌고, 공개본 일은 그 뒤에 다시 돈다", () => {
    const t = setup();
    t.controller.open(BASE, DRAFT);
    t.finish(t.workerAt(7));
    const baseRun = t.workerAt(7);
    expect(t.controller.getSnapshot().lanes.final.running?.role).toBe("base");
    t.stage(baseRun, "tectonics");
    t.controller.setDraft(OTHER, "final");
    expect(baseRun.terminated).toBe(true);
    const snapshot = t.controller.getSnapshot();
    expect(snapshot.lanes.final).toMatchObject({ running: { role: "draft" }, waiting: 1 });
    t.finish(t.workerAt(7));
    expect(t.controller.getSnapshot().lanes.final.running?.role).toBe("base");
    t.drain();
    expect(t.controller.getSnapshot().base.final.status).toBe("ready");
  });

  it("다시 열면 앞 행성의 기후 전 공개본 일을 끝내고 새 초안 일을 바로 보낸다", () => {
    const t = setup();
    t.controller.open(BASE, DRAFT);
    t.finish(t.workerAt(7));
    const baseRun = t.workerAt(7);
    t.stage(baseRun, "tectonics");
    t.controller.open(OTHER, OTHER);
    expect(baseRun.terminated).toBe(true);
    const snapshot = t.controller.getSnapshot();
    expect(snapshot.lanes.final.running).toMatchObject({ role: "draft", key: snapshot.draft.final.key });
  });
});

describe("원하지 않게 된 일", () => {
  it("F9 공개본을 돌리다 F7로 돌아가면 기후 전이면 끝내고, 다음 초안 일을 막지 않는다", () => {
    const t = setup();
    t.controller.open(BASE, DRAFT);
    t.drain();
    t.controller.setFinalLevel(HIGHEST);
    t.finish(t.workerAt(HIGHEST));
    t.controller.requestBaseFinal();
    const baseRun = t.workerAt(HIGHEST);
    t.stage(baseRun, "tectonics");
    t.controller.setFinalLevel(7);
    expect(baseRun.terminated).toBe(true);
    expect(t.sentinel.at(-1)).toBe("end");
    expect(t.controller.getSnapshot().lanes.final.running).toBeNull();
    t.controller.setDraft(OTHER, "final");
    expect(t.last(t.workerAt(7)).key).toBe(t.controller.getSnapshot().draft.final.key);
  });

  it("도는 초안이 틀린 값으로 바뀌면(rejected) 기후 전 일을 끝낸다", () => {
    const t = setup();
    t.controller.open(BASE, DRAFT);
    t.drain();
    t.controller.setFinalLevel(HIGHEST);
    const run = t.workerAt(HIGHEST);
    t.stage(run, "grid");
    t.controller.setDraft(INVALID, "final");
    expect(run.terminated).toBe(true);
    const snapshot = t.controller.getSnapshot();
    expect(snapshot.draft.final).toMatchObject({ status: "failed", error: "rejected" });
    expect(snapshot.lanes.final.running).toBeNull();
    expect(t.sentinel.at(-1)).toBe("end");
  });
});

describe("무거운 레벨(F8·F9)의 공개본", () => {
  it("화면이 청할 때까지 만들지 않는다(deferred), 청하면 초안 일 뒤에 돈다", () => {
    const t = setup();
    t.controller.open(BASE, DRAFT);
    t.drain();
    t.controller.setFinalLevel(HIGHEST);
    let snapshot = t.controller.getSnapshot();
    expect(snapshot.base.final).toMatchObject({ status: "deferred", level: HIGHEST });
    // 미룬 동안은 앞 공개본 결과(F7)를 낡은 것으로 보인다
    expect(snapshot.base.final.entry?.level).toBe(7);
    expect(snapshot.base.final.current).toBe(false);
    t.finish(t.workerAt(HIGHEST));
    snapshot = t.controller.getSnapshot();
    expect(snapshot.lanes.final.running).toBeNull();
    expect(t.posted().filter((request) => request.input.faceLevel === HIGHEST)).toHaveLength(1);
    t.controller.requestBaseFinal();
    expect(t.controller.getSnapshot().base.final.status).toBe("running");
    t.finish(t.workerAt(HIGHEST));
    expect(t.controller.getSnapshot().base.final).toMatchObject({ status: "ready", level: HIGHEST });
  });

  it("초안이 공개본과 같으면 초안 결과가 곧 공개본 결과다(한 번만 만든다)", () => {
    const t = setup();
    t.controller.open(BASE, BASE);
    t.drain();
    t.controller.setFinalLevel(HIGHEST);
    expect(t.controller.getSnapshot().base.final.status).toBe("running");
    t.drain();
    expect(t.controller.getSnapshot().base.final).toMatchObject({ status: "ready", current: true });
    expect(t.posted().filter((request) => request.input.faceLevel === HIGHEST)).toHaveLength(1);
  });

  it("청한 것은 그 레벨에 있는 동안만: 멈추거나 레벨을 바꾸면 다시 deferred", () => {
    const t = setup();
    t.controller.open(BASE, DRAFT);
    t.drain();
    t.controller.setFinalLevel(HIGHEST);
    t.controller.requestBaseFinal();
    expect(t.controller.getSnapshot().lanes.final.waiting).toBe(1);
    t.controller.cancelFinal();
    expect(t.controller.getSnapshot().base.final.status).toBe("cancelled");
    t.controller.setFinalLevel(HIGHEST);
    expect(t.controller.getSnapshot().base.final.status).toBe("deferred");
    t.controller.requestBaseFinal();
    t.controller.setFinalLevel(8);
    expect(t.controller.getSnapshot().base.final).toMatchObject({ status: "deferred", level: 8 });
  });
});

describe("해시 기억·버림", () => {
  it("결과 기억에서 버린 F9의 해시도 내보내기 checks에 남는다", () => {
    const t = setup();
    t.controller.open(BASE, DRAFT);
    t.drain();
    t.controller.setFinalLevel(HIGHEST);
    t.finish(t.workerAt(HIGHEST));
    const withNine = [
      { faceLevel: 7, hash: "00000007" },
      { faceLevel: HIGHEST, hash: `0000000${HIGHEST}` },
    ];
    expect(t.controller.checks(DRAFT)).toEqual(withNine);
    t.controller.setFinalLevel(7);
    expect(t.controller.lookup(DRAFT, HIGHEST)).toBeUndefined();
    expect(t.controller.checks(DRAFT)).toEqual(withNine);
  });

  it("버리면 결과·해시·자리를 모두 놓는다(남은 참조가 결과 배열을 붙잡지 않게)", () => {
    const t = setup();
    t.controller.open(BASE, BASE);
    t.drain();
    expect(t.controller.getSnapshot().base.final.entry).not.toBeNull();
    t.controller.dispose();
    const snapshot = t.controller.getSnapshot();
    for (const role of ["base", "draft"] as const) {
      for (const lane of ["quick", "final"] as const) {
        expect(snapshot[role][lane]).toMatchObject({ key: null, entry: null, status: "idle" });
      }
    }
    expect(snapshot.cacheBytes).toBe(0);
    expect(t.controller.checks(BASE)).toEqual([]);
  });
});

/** 고정 시드 난수(0 이상 1 미만, 시험 차례를 섞는 데만 쓴다) */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    return state / 4_294_967_296;
  };
}

const STAGES: readonly PreviewStage[] = [
  "grid",
  "tectonics",
  "seaLevel",
  "flowDirections",
  "climate",
  "erosion",
  "summary",
  "levels",
];
/** 레벨별 넘긴 바이트(작업 기록의 잰 값): 결과 기억 상한(32MiB)이 실제처럼 버리게 */
const BYTES = new Map([
  [5, 95_676],
  [6, 379_548],
  [7, 1_512_060],
  [8, 6_036_156],
  [9, 24_120_636],
]);

describe("무작위 차례(고정 시드)", () => {
  it("어떤 차례로 조작해도 줄을 다 비우면 청한 자리는 모두 끝 상태다", () => {
    const definitions = [BASE, DRAFT, OTHER, TAPPED, definitionOf(withSeed(TEST_PLANET, 11))];
    const problems: string[] = [];
    for (const seed of [1, 2, 3]) {
      const random = seeded(seed);
      const pick = <T>(items: readonly T[]): T => {
        const item = items[Math.floor(random() * items.length)];
        if (item === undefined) throw new Error("empty");
        return item;
      };
      for (let run = 0; run < 60; run++) {
        const t = setup();
        const stageOf = new Map<number, number>();
        let depth = 0;
        const sentinelDepth = (): number => {
          depth = 0;
          for (const entry of t.sentinel) depth += entry === "end" ? -1 : 1;
          return depth;
        };
        const note = (problem: string) => problems.push(`seed ${seed} run ${run}: ${problem}`);
        t.controller.open(pick(definitions), pick(definitions));
        for (let step = 0; step < 60; step++) {
          const roll = random();
          const busy = t.busy();
          const worker: FakeWorker | undefined = busy.length > 0 ? pick(busy) : undefined;
          if (roll < 0.15) t.controller.setDraft(random() < 0.1 ? INVALID : pick(definitions), "quick");
          else if (roll < 0.32) t.controller.setDraft(random() < 0.1 ? INVALID : pick(definitions), "final");
          else if (roll < 0.38) t.controller.setFinalLevel(pick([6, 7, 8, 9]));
          else if (roll < 0.4) t.controller.cancelFinal();
          else if (roll < 0.42) t.controller.open(pick(definitions), pick(definitions));
          else if (roll < 0.45) t.controller.requestBaseFinal();
          else if (worker && roll < 0.65) {
            const id = t.last(worker).id;
            const index = stageOf.get(id) ?? 0;
            const name = STAGES[index];
            if (name) t.stage(worker, name);
            stageOf.set(id, index + 1);
          } else if (worker && roll < 0.97) t.finish(worker, BYTES.get(t.last(worker).input.faceLevel));
          else if (worker) {
            worker.done = worker.posted.length;
            worker.handlers.onCrash();
          }
          if (t.workers.filter((w) => !w.terminated).length > 2) note("more than two live workers");
          if (t.busy().some((w) => w.posted.length !== w.done + 1)) note("posted to a busy worker");
          const snapshot = t.controller.getSnapshot();
          for (const lane of ["quick", "final"] satisfies PreviewLane[]) {
            const running = snapshot.lanes[lane].running;
            if (running && !t.busy().some((w) => w.posted[w.done]?.key === running.key))
              note(`${lane}: running job has no live worker`);
          }
          if (sentinelDepth() > 1 || depth < 0) note("sentinel begin/end out of balance");
        }
        t.drain();
        const snapshot = t.controller.getSnapshot();
        if (snapshot.lanes.quick.running || snapshot.lanes.final.running) note("lane still running");
        if (sentinelDepth() !== 0) note("sentinel left active");
        if (!snapshot.available) continue;
        for (const role of ["base", "draft"] as const) {
          for (const lane of ["quick", "final"] satisfies PreviewLane[]) {
            const view = snapshot[role][lane];
            const settled = ["ready", "cancelled", "deferred"].includes(view.status);
            if (view.key !== null && view.error === null && !settled) note(`${role}.${lane} ${view.status}`);
          }
        }
        t.controller.dispose();
      }
    }
    expect(problems).toEqual([]);
  });
});
