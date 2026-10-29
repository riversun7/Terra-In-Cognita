// 셰이더 측정 실행기의 순수 도우미 — 잴 순서, 메모 붙이기, 시간 상한·멈춤과 겨루는 기다림.
// DOM·three를 쓰지 않아 그대로 시험한다(gpuBenchPlan.test.ts). 실행기(gpuBenchRunner.ts)만 가져온다.
import type { BenchModeId, SessionInfo } from "./gpuBenchTypes.ts";

/**
 * round번째 타일 수에서 잴 방식 순서. 한 칸씩 돌려서 방식마다 한 번은 맨 앞에서 잰다.
 * 이유: 한 쪽(페이지)에서 처음 켜는 API(WebGL 컨텍스트·WebGPU 장치)의 한 번뿐인 비용은 그 API를 처음 쓰는 줄에만 든다.
 * 순서를 고정하면 늘 같은 방식이 그 비용을 내서 초기화 비교가 순서에 따라 달라진다(리뷰에서 확인).
 */
export function modeOrder(modes: readonly BenchModeId[], round: number): BenchModeId[] {
  const count = modes.length;
  if (count === 0) return [];
  const shift = ((Math.trunc(round) % count) + count) % count;
  return [...modes.slice(shift), ...modes.slice(0, shift)];
}

/** 메모를 덧붙인다(앞 메모를 지우지 않는다) */
export function addNote(current: string | null, note: string): string {
  return current === null || current === "" ? note : `${current}; ${note}`;
}

/**
 * 렌더러를 켠 뒤 그 줄에 붙일 메모.
 * - first_use: 이 쪽에서 그 API를 처음 켰다(초기화에 한 번뿐인 시작 비용이 든다)
 * - no_msaa: WebGPU 어댑터에 핵심 기능이 없어(호환 모드) three가 MSAA를 껐다(WebGPUBackend.js). WebGL 줄은 MSAA ×4라
 *   채우기 비용이 달라 프레임 수치를 바로 비교하지 않는다
 */
export function startNotes(
  info: Pick<SessionInfo, "backend" | "samples" | "compatibilityMode">,
  firstOfBackend: boolean,
): string[] {
  const notes: string[] = [];
  if (firstOfBackend) notes.push("first_use");
  if (info.backend === "webgpu" && info.compatibilityMode === true && info.samples === 0)
    notes.push("no_msaa");
  return notes;
}

/** 멈춤(signal)으로 기다림을 그만둘 때의 오류 메시지 */
export const STOPPED = "stopped";

export interface GuardOptions<T> {
  /** 시간 상한(ms) */
  ms: number;
  /** 시간이 넘었을 때의 오류 메시지 */
  label: string;
  signal: AbortSignal;
  /** 기다림을 먼저 그만둔(시간 넘김·멈춤) 뒤에 약속이 풀리면 그 값을 넘긴다 — 늦게 생긴 렌더러를 버릴 때 쓴다 */
  onLate?: (value: T) => void;
}

/** 늦게 풀린 값을 넘길 때 난 오류는 결과에 영향이 없다(삼킨다) */
function deliverLate<T>(onLate: ((value: T) => void) | undefined, value: T): void {
  try {
    onLate?.(value);
  } catch {
    // 버리다 난 오류는 무시한다
  }
}

/**
 * 약속을 시간 상한·멈춤과 겨룬다. 먼저 끝난 쪽을 따른다.
 * 그만둔 뒤 늦게 풀린 값은 onLate로 넘기고(three 렌더러는 init() 뒤 내부 rAF 반복이 dispose()까지 돌고 GPU 장치도 남는다),
 * 늦은 실패는 삼킨다(처리하지 않은 거부가 남지 않게).
 */
export function guard<T>(promise: Promise<T>, options: GuardOptions<T>): Promise<T> {
  const { ms, label, signal, onLate } = options;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // 서로 부르는 두 함수라 함수 선언(끌어올림)으로 둔다
    function finish(): boolean {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      return true;
    }
    function onAbort(): void {
      giveUp(STOPPED);
    }
    const giveUp = (reason: string): void => {
      if (finish()) reject(new Error(reason));
    };
    void promise.then(
      (value) => {
        if (finish()) resolve(value);
        else deliverLate(onLate, value);
      },
      (error: unknown) => {
        if (finish()) reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
    if (signal.aborted) {
      giveUp(STOPPED);
      return;
    }
    signal.addEventListener("abort", onAbort);
    timer = setTimeout(() => giveUp(label), ms);
  });
}
