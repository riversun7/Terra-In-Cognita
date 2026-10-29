// 미리보기 작업 줄 시험 — 면 레벨, 열쇠, 줄마다 도는 일 하나 + 기다리는 일, 낡은 본 일(기후 전이면 다시 띄움)
import { NORMAL_PRESETS, PLANET_GENERATOR_FACE_LEVELS, resolvePlanetSettings } from "@terra/shared";
import type { PlanetGeneratorInput } from "@terra/planet/generator";
import { describe, expect, it } from "vitest";
import {
  EMPTY_LANE,
  FINAL_POLICY,
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

/** 일 하나를 돌리는 줄 */
function runningLane(running: PreviewJob): LaneState {
  return submitJob(EMPTY_LANE, running, FINAL_POLICY).state;
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
    const step = submitJob(EMPTY_LANE, job(1, "a"), FINAL_POLICY);
    expect(step.commands).toEqual([{ kind: "post", job: job(1, "a") }]);
    expect(step.state.running?.job.id).toBe(1);
  });

  it("본 줄: 기후 단계 전이면 워커를 끝내고 새 일을 바로 시작한다", () => {
    let state = runningLane(job(1, "a"));
    state = noteStage(state, 1, "tectonics", FINAL_POLICY);
    const step = submitJob(state, job(2, "b"), FINAL_POLICY);
    expect(step.commands).toEqual([{ kind: "restart", dropped: job(1, "a"), job: job(2, "b") }]);
    expect(step.state.running?.job.id).toBe(2);
    expect(step.state.pending).toBeNull();
  });

  it("본 줄: 기후를 지났으면 끝까지 두고, 기다리는 일은 가장 새 것 하나만", () => {
    let state = runningLane(job(1, "a"));
    state = noteStage(state, 1, "climate", FINAL_POLICY);
    state = noteStage(state, 1, "erosion", FINAL_POLICY);
    expect(state.running?.pastRestartPoint).toBe(true);
    let step = submitJob(state, job(2, "b"), FINAL_POLICY);
    expect(step.commands).toEqual([]);
    step = submitJob(step.state, job(3, "c"), FINAL_POLICY);
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
    const state = submitJob(EMPTY_LANE, job(1, "a", "draft", 5), QUICK_POLICY).state;
    const step = submitJob(state, job(2, "b", "draft", 5), QUICK_POLICY);
    expect(step.commands).toEqual([]);
    expect(step.state.pending?.id).toBe(2);
  });

  it("도는 일과 같은 열쇠면 기다리던 낡은 일만 버린다", () => {
    let state = runningLane(job(1, "a"));
    state = noteStage(state, 1, "climate", FINAL_POLICY);
    state = submitJob(state, job(2, "b"), FINAL_POLICY).state;
    const step = submitJob(state, job(3, "a"), FINAL_POLICY);
    expect(step.commands).toEqual([]);
    expect(step.state.pending).toBeNull();
    expect(step.state.running?.job.id).toBe(1);
  });

  it("공개본 일은 초안 일 뒤에 서고, 초안 일 때문에 끝나지 않는다", () => {
    let state = runningLane(job(1, "draft-7"));
    state = submitJob(state, job(2, "base-7", "base"), FINAL_POLICY).state;
    expect(state.background.map((item) => item.id)).toEqual([2]);
    // 같은 열쇠의 공개본 일은 한 번만
    expect(submitJob(state, job(3, "base-7", "base"), FINAL_POLICY).state).toBe(state);
    // 공개본 일이 돌 때 새 초안 일은 기다린다
    let step = finishJob(state, 1);
    expect(step.commands).toEqual([{ kind: "post", job: job(2, "base-7", "base") }]);
    step = submitJob(step.state, job(4, "draft-7b"), FINAL_POLICY);
    expect(step.commands).toEqual([]);
    expect(step.state.pending?.id).toBe(4);
  });

  it("끝나면 기다리는 초안 일 → 공개본 일 차례, 필요 없는 일은 건너뛴다", () => {
    let state = runningLane(job(1, "a"));
    state = noteStage(state, 1, "climate", FINAL_POLICY);
    state = submitJob(state, job(2, "base", "base"), FINAL_POLICY).state;
    state = submitJob(state, job(3, "b"), FINAL_POLICY).state;
    expect(finishJob(state, 1).commands).toEqual([{ kind: "post", job: job(3, "b") }]);
    const skipped = finishJob(state, 1, (item) => item.key !== "b");
    expect(skipped.commands).toEqual([{ kind: "post", job: job(2, "base", "base") }]);
    expect(finishJob(state, 1, () => false)).toEqual({ state: EMPTY_LANE, commands: [] });
    // 도는 일이 아닌 번호는 무시
    expect(finishJob(state, 7).state).toBe(state);
  });

  it("멈추면 워커를 끝내고 기다리는 일도 버린다", () => {
    let state = runningLane(job(1, "a", "draft", 9));
    state = submitJob(state, job(2, "base", "base", 9), FINAL_POLICY).state;
    expect(cancelLane(state)).toEqual({
      state: EMPTY_LANE,
      commands: [{ kind: "restart", dropped: job(1, "a", "draft", 9), job: null }],
    });
    expect(cancelLane(EMPTY_LANE)).toEqual({ state: EMPTY_LANE, commands: [] });
  });

  it("원하지 않게 된 일: 기다리는 것은 버리고, 기후 전 초안 일은 다음 원하는 일로 바꾼다", () => {
    let state = runningLane(job(1, "old"));
    state = submitJob(state, job(2, "base", "base"), FINAL_POLICY).state;
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
    const quick = submitJob(EMPTY_LANE, job(1, "old", "draft", 5), QUICK_POLICY).state;
    expect(retainWanted(quick, wanted, QUICK_POLICY).commands).toEqual([]);
  });
});
