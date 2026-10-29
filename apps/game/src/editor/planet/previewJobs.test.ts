// 미리보기 작업 줄 시험 — 면 레벨, 열쇠, 줄마다 도는 일 하나 + 기다리는 일, 낡은 본 일(기후 전이면 다시 띄움),
// 밀려난 일 중 아직 필요한 것은 공개본 일로 다시 섬, 원하지 않게 된 공개본 일도 기후 전이면 끝냄
import { NORMAL_PRESETS, PLANET_GENERATOR_FACE_LEVELS, resolvePlanetSettings } from "@terra/shared";
import type { PlanetGeneratorInput } from "@terra/planet/generator";
import { describe, expect, it } from "vitest";
import {
  EMPTY_LANE,
  FINAL_POLICY,
  type JobNeeded,
  type LaneState,
  type PreviewJob,
  type PreviewRole,
  QUICK_POLICY,
  cancelLane,
  clampFinalLevel,
  finishJob,
  levelOfKey,
  noteStage,
  previewKey,
  previewLevels,
  retainWanted,
  submitJob,
} from "./previewJobs.ts";

const [LOWEST, HIGHEST] = PLANET_GENERATOR_FACE_LEVELS;

const input = (faceLevel = 7, seed = 1): PlanetGeneratorInput => ({
  faceLevel,
  seed,
  settings: resolvePlanetSettings(NORMAL_PRESETS),
  biomes: [{ id: "ocean", forestDensity: 0, rule: { kind: "ocean", depthClass: "deep" } }],
});

const job = (id: number, key: string, role: PreviewRole = "draft", level = 7): PreviewJob => ({
  id,
  key,
  level,
  role,
  input: input(level),
});

/** "old" 열쇠만 원하지 않는다 */
const wanted = (item: PreviewJob): boolean => item.key !== "old";
/** 밀려난 일을 아무도 청하지 않는다 */
const none: JobNeeded = () => false;
/** 이 열쇠들만 아직 청한다 */
const only =
  (...keys: string[]): JobNeeded =>
  (item) =>
    keys.includes(item.key);

/** 일 하나를 돌리는 줄 */
function runningLane(running: PreviewJob): LaneState {
  return submitJob(EMPTY_LANE, running, FINAL_POLICY, none).state;
}

describe("미리보기 면 레벨", () => {
  it("상한 = min(정의 면 레벨, 생성기 상한, 기기 상한), 빠른 F5·기본 F7·고르기 F6~상한", () => {
    const levels = previewLevels(HIGHEST);
    expect(levels.cap).toBe(HIGHEST);
    expect(levels.quick).toBe(5);
    expect(levels.finalDefault).toBe(7);
    expect(levels.finalChoices[0]).toBe(6);
    expect(levels.finalChoices.at(-1)).toBe(HIGHEST);
    expect(previewLevels(HIGHEST + 3).cap).toBe(HIGHEST);
    expect(previewLevels(HIGHEST, 7)).toEqual({ cap: 7, quick: 5, finalDefault: 7, finalChoices: [6, 7] });
  });

  it("작은 행성은 그 면 레벨까지만", () => {
    expect(previewLevels(6)).toEqual({ cap: 6, quick: 5, finalDefault: 6, finalChoices: [6] });
    expect(previewLevels(LOWEST)).toEqual({
      cap: LOWEST,
      quick: Math.min(5, LOWEST),
      finalDefault: LOWEST,
      finalChoices: [LOWEST],
    });
    // 기기 상한이 생성기 아래쪽 값보다 낮아도 아래쪽 값에서 멈춘다
    expect(previewLevels(HIGHEST, LOWEST - 2).cap).toBe(LOWEST);
  });

  it("본 줄 레벨은 고를 수 있는 값으로 맞춘다", () => {
    const levels = previewLevels(HIGHEST, 8);
    expect(clampFinalLevel(levels, 9)).toBe(8);
    expect(clampFinalLevel(levels, 5)).toBe(6);
    expect(clampFinalLevel(levels, 7.4)).toBe(7);
  });
});

describe("결과 기억 열쇠", () => {
  it("면 레벨 + 키를 정렬한 입력 JSON: 키 순서와 무관, 값이 다르면 다르다", () => {
    const a = input(7, 1);
    const reordered: PlanetGeneratorInput = {
      biomes: a.biomes,
      settings: a.settings,
      seed: a.seed,
      faceLevel: a.faceLevel,
    };
    expect(previewKey(reordered)).toBe(previewKey(a));
    expect(previewKey(input(7, 2))).not.toBe(previewKey(a));
    expect(previewKey(input(5, 1))).not.toBe(previewKey(a));
    expect(levelOfKey(previewKey(input(5, 1)))).toBe(5);
  });
});

describe("작업 줄", () => {
  it("빈 줄에 넣으면 바로 보낸다", () => {
    const step = submitJob(EMPTY_LANE, job(1, "a"), FINAL_POLICY, none);
    expect(step.commands).toEqual([{ kind: "post", job: job(1, "a") }]);
    expect(step.state.running?.job.id).toBe(1);
  });

  it("본 줄: 기후 단계 전이면 워커를 끝내고 새 일을 바로 시작한다", () => {
    let state = runningLane(job(1, "a"));
    state = noteStage(state, 1, "tectonics", FINAL_POLICY);
    const step = submitJob(state, job(2, "b"), FINAL_POLICY, none);
    expect(step.commands).toEqual([{ kind: "restart", dropped: job(1, "a"), job: job(2, "b") }]);
    expect(step.state.running?.job.id).toBe(2);
    expect(step.state.pending).toBeNull();
  });

  it("본 줄: 기후를 지났으면 끝까지 두고, 기다리는 일은 가장 새 것 하나만", () => {
    let state = runningLane(job(1, "a"));
    state = noteStage(state, 1, "climate", FINAL_POLICY);
    state = noteStage(state, 1, "erosion", FINAL_POLICY);
    expect(state.running?.pastRestartPoint).toBe(true);
    let step = submitJob(state, job(2, "b"), FINAL_POLICY, none);
    expect(step.commands).toEqual([]);
    step = submitJob(step.state, job(3, "c"), FINAL_POLICY, none);
    expect(step.state.pending?.id).toBe(3);
    const done = finishJob(step.state, 1);
    expect(done.commands).toEqual([{ kind: "post", job: job(3, "c") }]);
    expect(done.state.pending).toBeNull();
  });

  it("다른 일의 단계 알림은 무시한다", () => {
    const state = runningLane(job(1, "a"));
    expect(noteStage(state, 9, "climate", FINAL_POLICY)).toBe(state);
  });

  it("빠른 줄은 늘 끝까지 둔다(새 일은 기다린다)", () => {
    const state = submitJob(EMPTY_LANE, job(1, "a", "draft", 5), QUICK_POLICY, none).state;
    const step = submitJob(state, job(2, "b", "draft", 5), QUICK_POLICY, none);
    expect(step.commands).toEqual([]);
    expect(step.state.pending?.id).toBe(2);
  });

  it("도는 일과 같은 열쇠면 기다리던 낡은 일만 버린다", () => {
    let state = runningLane(job(1, "a"));
    state = noteStage(state, 1, "climate", FINAL_POLICY);
    state = submitJob(state, job(2, "b"), FINAL_POLICY, none).state;
    const step = submitJob(state, job(3, "a"), FINAL_POLICY, none);
    expect(step.commands).toEqual([]);
    expect(step.state.pending).toBeNull();
    expect(step.state.running?.job.id).toBe(1);
  });

  it("공개본 일은 초안 일 뒤에 서고, 같은 열쇠는 한 번만", () => {
    let state = runningLane(job(1, "draft-7"));
    state = submitJob(state, job(2, "base-7", "base"), FINAL_POLICY, none).state;
    expect(state.background.map((item) => item.id)).toEqual([2]);
    expect(submitJob(state, job(3, "base-7", "base"), FINAL_POLICY, none).state).toBe(state);
    // 도는 초안 일이 기후를 지났으면 공개본 일은 그 뒤에 돈다
    state = noteStage(state, 1, "climate", FINAL_POLICY);
    const step = finishJob(state, 1);
    expect(step.commands).toEqual([{ kind: "post", job: job(2, "base-7", "base") }]);
  });

  it("도는 공개본 일도 기후 전이면 새 초안 일에 자리를 내주고, 아직 필요하면 공개본 차례 맨 앞에 다시 선다", () => {
    let state = finishJob(
      submitJob(runningLane(job(1, "d")), job(2, "base", "base"), FINAL_POLICY, none).state,
      1,
    ).state;
    state = submitJob(state, job(3, "base2", "base"), FINAL_POLICY, none).state;
    expect(state.running?.job.key).toBe("base");
    const step = submitJob(state, job(4, "d2"), FINAL_POLICY, only("base", "base2"));
    expect(step.commands).toEqual([{ kind: "restart", dropped: job(2, "base", "base"), job: job(4, "d2") }]);
    expect(step.state.background.map((item) => item.key)).toEqual(["base", "base2"]);
    // 기후를 지난 공개본 일은 끝까지 두고 새 초안 일은 기다린다
    const late = noteStage(state, 2, "climate", FINAL_POLICY);
    expect(submitJob(late, job(4, "d2"), FINAL_POLICY, only("base")).state.pending?.key).toBe("d2");
  });

  it("공개본 청이 합쳐진 초안 일(같은 열쇠)이 밀려나도 공개본 일로 다시 선다", () => {
    // 초안 = 공개본: 공개본 청은 도는 초안 일에 합쳐진다
    let state = runningLane(job(1, "same"));
    state = submitJob(state, job(2, "same", "base"), FINAL_POLICY, none).state;
    expect(state.background).toEqual([]);
    // 기후 전에 새 초안: 도는 일을 끝내도 그 열쇠는 공개본 자리가 아직 청한다
    const restarted = submitJob(state, job(3, "new"), FINAL_POLICY, only("same"));
    expect(restarted.commands).toEqual([{ kind: "restart", dropped: job(1, "same"), job: job(3, "new") }]);
    expect(restarted.state.background).toEqual([job(1, "same", "base")]);
    // 기다리던 초안 일이 바뀔 때도 같다(빠른 줄: 늘 끝까지 두므로 기다리는 자리에서 합쳐진다)
    let quick = submitJob(EMPTY_LANE, job(1, "q0", "draft", 5), QUICK_POLICY, none).state;
    quick = submitJob(quick, job(2, "same", "draft", 5), QUICK_POLICY, none).state;
    quick = submitJob(quick, job(3, "same", "base", 5), QUICK_POLICY, none).state;
    const replaced = submitJob(quick, job(4, "q2", "draft", 5), QUICK_POLICY, only("same"));
    expect(replaced.state.pending?.key).toBe("q2");
    expect(replaced.state.background).toEqual([job(2, "same", "base", 5)]);
    // 아무도 청하지 않으면 버린다, 새 일과 같은 열쇠는 다시 세우지 않는다
    expect(submitJob(quick, job(4, "q2", "draft", 5), QUICK_POLICY, none).state.background).toEqual([]);
    expect(submitJob(quick, job(4, "same", "draft", 5), QUICK_POLICY, only("same")).state.background).toEqual(
      [],
    );
  });

  it("끝나면 기다리는 초안 일 → 공개본 일 차례, 필요 없는 일은 건너뛴다", () => {
    let state = runningLane(job(1, "a"));
    state = noteStage(state, 1, "climate", FINAL_POLICY);
    state = submitJob(state, job(2, "base", "base"), FINAL_POLICY, none).state;
    state = submitJob(state, job(3, "b"), FINAL_POLICY, none).state;
    expect(finishJob(state, 1).commands).toEqual([{ kind: "post", job: job(3, "b") }]);
    const skipped = finishJob(state, 1, (item) => item.key !== "b");
    expect(skipped.commands).toEqual([{ kind: "post", job: job(2, "base", "base") }]);
    expect(finishJob(state, 1, () => false)).toEqual({ state: EMPTY_LANE, commands: [] });
    // 도는 일이 아닌 번호는 무시
    expect(finishJob(state, 7).state).toBe(state);
  });

  it("멈추면 워커를 끝내고 기다리는 일도 버린다", () => {
    let state = runningLane(job(1, "a", "draft", 9));
    state = submitJob(state, job(2, "base", "base", 9), FINAL_POLICY, none).state;
    expect(cancelLane(state)).toEqual({
      state: EMPTY_LANE,
      commands: [{ kind: "restart", dropped: job(1, "a", "draft", 9), job: null }],
    });
    expect(cancelLane(EMPTY_LANE)).toEqual({ state: EMPTY_LANE, commands: [] });
  });

  it("원하지 않게 된 일: 기다리는 것은 버리고, 기후 전 도는 일은 다음 원하는 일로 바꾼다", () => {
    let state = runningLane(job(1, "old"));
    state = submitJob(state, job(2, "base", "base"), FINAL_POLICY, none).state;
    const step = retainWanted(state, wanted, FINAL_POLICY);
    expect(step.commands).toEqual([{ kind: "restart", dropped: job(1, "old"), job: job(2, "base", "base") }]);
    expect(step.state.background).toEqual([]);
    // 아무것도 남지 않으면 끝내기만
    const alone = retainWanted(runningLane(job(1, "old")), wanted, FINAL_POLICY);
    expect(alone.commands).toEqual([{ kind: "restart", dropped: job(1, "old"), job: null }]);
    // 기후를 지났으면 그대로 둔다(결과는 기억한다)
    const late = noteStage(runningLane(job(1, "old")), 1, "climate", FINAL_POLICY);
    expect(retainWanted(late, wanted, FINAL_POLICY).commands).toEqual([]);
    // 빠른 줄은 끝내지 않는다
    const quick = submitJob(EMPTY_LANE, job(1, "old", "draft", 5), QUICK_POLICY, none).state;
    expect(retainWanted(quick, wanted, QUICK_POLICY).commands).toEqual([]);
    // 원하지 않게 된 공개본 일(예: F9 공개본을 돌리다 F7로 돌아감)도 기후 전이면 끝낸다
    const base = submitJob(EMPTY_LANE, job(1, "old", "base", 9), FINAL_POLICY, none).state;
    expect(retainWanted(base, wanted, FINAL_POLICY).commands).toEqual([
      { kind: "restart", dropped: job(1, "old", "base", 9), job: null },
    ]);
  });
});
