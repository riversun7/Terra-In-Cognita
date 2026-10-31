// 미리보기 작업 줄(순수) — ADR 38 3절, 설계 D.3 "Lanes"·"Stale final run"
// 줄은 둘이다: 빠른 줄(F5, 열 때와 슬라이더를 끄는 동안)과 본 줄(기본 F7, F6·F8·F9는 고를 때). 줄마다 워커 하나.
// - 줄마다 도는 일 하나 + 기다리는 초안 일 하나. 새 초안 일이 오면 기다리던 것을 바꾼다(가장 새 것만 남는다).
// - 공개본 일(차이 열·번갈아 보기용)은 뒤에 줄 선다: 기다리는 초안 일이 없을 때 돈다.
// - 본 줄의 낡은 일: 새 초안 일이 왔을 때 도는 일(초안·공개본)이 기후 단계(climate)를 아직 알리지 않았으면 워커를 끝내고
//   다시 띄워 새 일을 바로 시작한다(다시 띄우는 값 F7 약 0.3~0.4초). 기후를 지났으면 끝까지 두고(남은 일 약 12~17%)
//   결과는 기억한다. 빠른 줄은 늘 끝까지 둔다(F5는 짧다).
// - 밀려난 일(끝낸 도는 일, 바뀐 기다리는 일)의 열쇠를 아직 누가 청하고 있으면(needed) 공개본 일로 공개본 차례 맨 앞에
//   다시 세운다. 초안이 공개본과 같아 공개본 청이 초안 일에 합쳐졌다가 초안이 바뀌어도 공개본 결과를 잃지 않게(검토 지적).
// - 원하지 않게 된 도는 일(초안·공개본)도 기후 전이면 끝낸다(retainWanted): 보지 않을 F9 공개본이 초안 일을 막지 않게.
// 이 파일은 상태와 "할 일"만 계산한다. 워커를 다루는 일은 previewController.ts가 한다.
import { PLANET_EDITOR_CHECK_FACE_LEVEL, PLANET_GENERATOR_FACE_LEVELS } from "@terra/shared";
import type { GeneratorStage, PlanetGeneratorInput } from "@terra/planet/generator";
import type { PreviewStage } from "./previewProtocol.ts";
import { stableJson } from "./stableJson.ts";

export type PreviewLane = "quick" | "final";
export type PreviewRole = "base" | "draft";

/** 빠른 줄 면 레벨(ADR 38: 빠른 F5) = 서버 확인 해시 레벨(공용 값 하나: 열 때 공개본을 이 레벨로 만들어 서버와 견준다) */
export const QUICK_LEVEL = PLANET_EDITOR_CHECK_FACE_LEVEL;
/** 본 줄 기본 면 레벨(ADR 38: 기본 F7) */
export const DEFAULT_FINAL_LEVEL = 7;
/** 본 줄에서 고를 수 있는 가장 낮은 면 레벨(F6) */
export const MIN_FINAL_LEVEL = 6;
/**
 * 무거운 면 레벨(F8 이상): 시작 전에 꺼짐 감지 표시를 남기고(crashSentinel.ts), 공개본 본 결과는 화면이 청할 때만 만든다
 * (previewController requestBaseFinal). F9는 데스크톱에서도 약 15초, 워커 타입 배열 최대 약 180MiB다(출력 판 3)(memoryEstimate.ts)
 */
export const HEAVY_PREVIEW_LEVEL = 8;

/** 미리보기 면 레벨들 */
export interface PreviewLevels {
  /** 상한 = min(정의 면 레벨, 생성기 상한, 기기 상한) */
  readonly cap: number;
  readonly quick: number;
  readonly finalDefault: number;
  /** 본 줄에서 고를 수 있는 레벨(오름차순) */
  readonly finalChoices: readonly number[];
}

/**
 * 미리보기 면 레벨. 상한은 정의의 면 레벨과 생성기 면 레벨 표(PLANET_GENERATOR_FACE_LEVELS)의 위쪽 값 중 작은 쪽이고,
 * 꺼짐 감지(crashSentinel.ts)가 낮춘 기기 상한이 있으면 그것도 넘지 않는다. 생성기 아래쪽 값보다 낮아지지는 않는다.
 */
export function previewLevels(
  definitionFaceLevel: number,
  deviceMaxLevel: number | null = null,
): PreviewLevels {
  const [lowest, highest] = PLANET_GENERATOR_FACE_LEVELS;
  const cap = Math.max(lowest, Math.min(definitionFaceLevel, highest, deviceMaxLevel ?? highest));
  const quick = Math.min(QUICK_LEVEL, cap);
  const finalChoices: number[] = [];
  for (let level = Math.max(MIN_FINAL_LEVEL, lowest); level <= cap; level++) finalChoices.push(level);
  if (finalChoices.length === 0) finalChoices.push(cap);
  return { cap, quick, finalDefault: Math.min(DEFAULT_FINAL_LEVEL, cap), finalChoices };
}

/** 본 줄 레벨을 고를 수 있는 값으로 맞춘다(가장 가까운 고를 수 있는 값) */
export function clampFinalLevel(levels: PreviewLevels, level: number): number {
  const choices = levels.finalChoices;
  const first = choices[0] ?? levels.cap;
  const last = choices.at(-1) ?? levels.cap;
  return Math.min(last, Math.max(first, Math.round(level)));
}

/** 결과 기억 열쇠 = 면 레벨 + 키를 정렬한 생성기 입력 JSON (입력에도 면 레벨이 있지만 앞에 따로 붙여 읽기 쉽게) */
export function previewKey(input: PlanetGeneratorInput): string {
  return `${input.faceLevel}:${stableJson(input)}`;
}

/** 열쇠의 면 레벨 */
export function levelOfKey(key: string): number {
  return Number.parseInt(key, 10);
}

export interface PreviewJob {
  readonly id: number;
  readonly key: string;
  readonly level: number;
  readonly role: PreviewRole;
  readonly input: PlanetGeneratorInput;
}

export interface RunningJob {
  readonly job: PreviewJob;
  /** 워커가 마지막으로 알린 단계(아직 없으면 null) */
  readonly stage: PreviewStage | null;
  /** 다시 띄우기 문턱 단계(정책 restartBefore)를 알렸는가 */
  readonly pastRestartPoint: boolean;
}

export interface LaneState {
  readonly running: RunningJob | null;
  /** 기다리는 초안 일(가장 새 것 하나) */
  readonly pending: PreviewJob | null;
  /** 기다리는 공개본 일(차례대로, 초안 일보다 뒤). 밀려났지만 아직 필요한 일도 공개본 일로 여기에 선다 */
  readonly background: readonly PreviewJob[];
}

export interface LanePolicy {
  /** 도는 일이 이 단계를 알리기 전이면 새 초안 일에 자리를 내준다(워커를 끝내고 다시 띄움). null이면 늘 끝까지 둔다 */
  readonly restartBefore: GeneratorStage | null;
}

/** 일이 아직 필요한가(청하는 자리가 있고 기억하지 않은 것). 관리자가 넘긴다 */
export type JobNeeded = (job: PreviewJob) => boolean;

export const QUICK_POLICY: LanePolicy = { restartBefore: null };
export const FINAL_POLICY: LanePolicy = { restartBefore: "climate" satisfies GeneratorStage };

export type LaneCommand =
  /** 워커에 일을 보낸다(워커가 없으면 만든다) */
  | { readonly kind: "post"; readonly job: PreviewJob }
  /** 워커를 끝낸다(도는 일 dropped는 버린다). job이 있으면 새 워커를 띄워 보낸다 */
  | { readonly kind: "restart"; readonly dropped: PreviewJob; readonly job: PreviewJob | null };

export interface LaneStep {
  readonly state: LaneState;
  readonly commands: readonly LaneCommand[];
}

export const EMPTY_LANE: LaneState = { running: null, pending: null, background: [] };

function start(job: PreviewJob): RunningJob {
  return { job, stage: null, pastRestartPoint: false };
}

/** 도는 일이 자리를 내줄 수 있는가(줄 정책이 있고 문턱 단계 전). 초안 일·공개본 일 모두 */
function yieldable(running: RunningJob, policy: LanePolicy): boolean {
  return policy.restartBefore !== null && !running.pastRestartPoint;
}

/**
 * 밀려난 일 중 아직 필요한 것을 공개본 일로 공개본 차례 맨 앞에 다시 세운다. 새 일(by)과 같은 열쇠, 이미 선 열쇠는 그대로 둔다
 */
function requeue(
  state: LaneState,
  by: PreviewJob,
  displaced: readonly (PreviewJob | null)[],
  needed: JobNeeded,
): readonly PreviewJob[] {
  const { background } = state;
  const front: PreviewJob[] = [];
  for (const job of displaced) {
    if (!job || job.key === by.key || !needed(job)) continue;
    if (front.some((item) => item.key === job.key) || background.some((item) => item.key === job.key))
      continue;
    front.push(job.role === "base" ? job : { ...job, role: "base" });
  }
  return front.length === 0 ? background : [...front, ...background];
}

/** 이 열쇠의 일이 줄에 이미 있는가(돌거나 기다리는) */
function queued(state: LaneState, key: string): boolean {
  return (
    state.running?.job.key === key ||
    state.pending?.key === key ||
    state.background.some((job) => job.key === key)
  );
}

/** 일을 줄에 넣는다. 초안 일이 밀어낸 일(끝낸 도는 일, 바꾼 기다리는 일)은 needed면 공개본 일로 다시 선다 */
export function submitJob(
  state: LaneState,
  job: PreviewJob,
  policy: LanePolicy,
  needed: JobNeeded,
): LaneStep {
  if (job.role === "base") {
    if (queued(state, job.key)) return { state, commands: [] };
    if (!state.running)
      return { state: { ...state, running: start(job) }, commands: [{ kind: "post", job }] };
    return { state: { ...state, background: [...state.background, job] }, commands: [] };
  }
  const { running, pending } = state;
  if (!running) {
    return {
      state: { running: start(job), pending: null, background: requeue(state, job, [pending], needed) },
      commands: [{ kind: "post", job }],
    };
  }
  // 도는 일이 바로 이 일이면 기다리던 낡은 일만 뺀다
  if (running.job.key === job.key) {
    return {
      state: { ...state, pending: null, background: requeue(state, job, [pending], needed) },
      commands: [],
    };
  }
  if (yieldable(running, policy)) {
    return {
      state: {
        running: start(job),
        pending: null,
        background: requeue(state, job, [running.job, pending], needed),
      },
      commands: [{ kind: "restart", dropped: running.job, job }],
    };
  }
  return {
    state: { ...state, pending: job, background: requeue(state, job, [pending], needed) },
    commands: [],
  };
}

/** 워커가 단계를 알렸다(도는 일이 아니면 그대로) */
export function noteStage(state: LaneState, id: number, stage: PreviewStage, policy: LanePolicy): LaneState {
  const { running } = state;
  if (!running || running.job.id !== id) return state;
  const pastRestartPoint = running.pastRestartPoint || stage === policy.restartBefore;
  return { ...state, running: { ...running, stage, pastRestartPoint } };
}

/**
 * 도는 일이 끝났다(결과·실패·워커 죽음). 다음 일을 꺼낸다: 기다리는 초안 일 → 공개본 일 차례.
 * needed가 false인 일(이미 기억한 결과 등)은 건너뛰고 버린다.
 */
export function finishJob(
  state: LaneState,
  id: number,
  needed: (job: PreviewJob) => boolean = () => true,
): LaneStep {
  if (state.running?.job.id !== id) return { state, commands: [] };
  // 기다리는 초안 일(있으면 하나)이 맨 앞이라 나머지는 모두 공개본 일이다
  const [next, ...rest] = waiting(state).filter(needed);
  if (!next) return { state: EMPTY_LANE, commands: [] };
  return {
    state: { running: start(next), pending: null, background: rest },
    commands: [{ kind: "post", job: next }],
  };
}

/** 기다리는 일 차례: 초안 일 → 공개본 일 */
function waiting(state: LaneState): PreviewJob[] {
  return [...(state.pending ? [state.pending] : []), ...state.background];
}

/** 줄을 비운다(F8·F9 멈춤 등): 도는 일이 있으면 워커를 끝낸다(다음 일 때 다시 띄운다) */
export function cancelLane(state: LaneState): LaneStep {
  const { running } = state;
  if (!running) return { state: EMPTY_LANE, commands: [] };
  return { state: EMPTY_LANE, commands: [{ kind: "restart", dropped: running.job, job: null }] };
}

/**
 * 더 원하지 않는 일을 뺀다: 기다리는 일 중 wanted가 false인 것은 버리고, 도는 일(초안·공개본)을 원하지 않고
 * 자리를 내줄 수 있으면(본 줄, 기후 전) 워커를 끝내고 다음 원하는 일을 시작한다. 기후를 지난 일은 끝까지 둔다.
 */
export function retainWanted(
  state: LaneState,
  wanted: (job: PreviewJob) => boolean,
  policy: LanePolicy,
): LaneStep {
  const pending = state.pending && wanted(state.pending) ? state.pending : null;
  const kept: LaneState = { ...state, pending, background: state.background.filter(wanted) };
  const { running } = kept;
  if (!running || wanted(running.job) || !yieldable(running, policy)) return { state: kept, commands: [] };
  const [next, ...rest] = waiting(kept);
  if (!next) {
    return { state: EMPTY_LANE, commands: [{ kind: "restart", dropped: running.job, job: null }] };
  }
  return {
    state: { running: start(next), pending: null, background: rest },
    commands: [{ kind: "restart", dropped: running.job, job: next }],
  };
}
