// GPU가 프레임을 끝낸 것을 언제 알았나를 잰다 — render()로 제출한 뒤, 다 그린 것을 확인한 프레임 시작까지(ms).
// 이유: WebGPU는 제출만 하고 바로 돌아온다. GPU가 못 따라와도 requestAnimationFrame은 계속 올 수 있어서
// 프레임 간격(fps)만 보면 GPU가 느린 것을 놓친다(헤드리스 SwiftShader에서 확인함). 완료 수/초가 실제 그린 양이다.
// 두 API를 같은 방법으로 본다: 프레임마다 처음에 한 번(collect) "끝났나"를 묻고, 끝났으면 그 시각으로 잰다.
// - WebGL2: fenceSync를 넣고 상태를 묻는다(기다리지 않는다). WebGL은 작업(task)이 끝난 뒤에만 상태를 바꾼다(WebGL 2 명세).
// - WebGPU: queue.onSubmittedWorkDone() 약속이 풀리면 "끝남" 표시만 하고, 시각은 다음 collect에서 잰다.
// 그래서 지연은 두 API 모두 프레임 간격 단위로 올린 값이다(GPU 시간이 아니라 "몇 프레임 뒤에 끝난 것을 봤나").
// WebGPU만 약속이 풀린 때로 재면 같은 GPU 일에도 WebGPU 쪽이 한 프레임 가까이 낮게 나온다(리뷰 지적, 2026-10-29).
// three를 가져오지 않는다(DOM API만). 두 방식 모듈이 함께 쓴다.

export interface GpuDoneTracker {
  /** render() 바로 뒤에 부른다 */
  mark(): void;
  /** 프레임 시작에 부른다: 그 뒤 끝난 것을 본 프레임들의 지연(ms)을 꺼낸다 */
  collect(): number[];
  /** 아직 끝난 것을 못 본 수 */
  pending(): number;
  /** 완료 알림이 실패한 수와 마지막 오류(헤드리스 SwiftShader WebGPU는 모두 실패한다) */
  failures(): { count: number; last: string | null };
  dispose(): void;
}

/** 쌓인 표시 상한 — GPU가 아주 느려도 메모리가 늘지 않게(다 차면 새로 표시하지 않는다. 두 API 같은 규칙) */
export const MAX_PENDING = 240;

/** WebGL2 컨텍스트에서 쓰는 것만(시험에서 가짜로 바꾼다) */
export type FenceContext = Pick<
  WebGL2RenderingContext,
  "fenceSync" | "getSyncParameter" | "deleteSync" | "SYNC_GPU_COMMANDS_COMPLETE" | "SYNC_STATUS" | "SIGNALED"
>;

/** WebGPU 장치에서 쓰는 것만(시험에서 가짜로 바꾼다) */
export interface WorkDoneDevice {
  queue: Pick<GPUQueue, "onSubmittedWorkDone">;
}

/** 시계(ms) — 시험에서 바꾼다 */
export type Clock = () => number;

const defaultClock: Clock = () => performance.now();

export function webglDoneTracker(gl: FenceContext, now: Clock = defaultClock): GpuDoneTracker {
  const queue: { sync: WebGLSync; start: number }[] = [];
  return {
    mark() {
      if (queue.length >= MAX_PENDING) return;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!sync) return;
      queue.push({ sync, start: now() });
    },
    collect() {
      const done: number[] = [];
      const at = now();
      // 앞에서부터 차례로 끝난다(같은 큐)
      while (queue.length > 0) {
        const head = queue[0];
        if (!head || gl.getSyncParameter(head.sync, gl.SYNC_STATUS) !== gl.SIGNALED) break;
        done.push(at - head.start);
        gl.deleteSync(head.sync);
        queue.shift();
      }
      return done;
    },
    pending: () => queue.length,
    failures: () => ({ count: 0, last: null }),
    dispose() {
      for (const item of queue) gl.deleteSync(item.sync);
      queue.length = 0;
    },
  };
}

type WorkState = "waiting" | "done" | "failed";

export function webgpuDoneTracker(device: WorkDoneDevice, now: Clock = defaultClock): GpuDoneTracker {
  // 제출 순서대로 둔다. onSubmittedWorkDone은 그 전에 제출한 일이 모두 끝나야 풀리므로 차례로 끝난다
  const queue: { start: number; state: WorkState }[] = [];
  let failed = 0;
  let lastError: string | null = null;
  let disposed = false;
  return {
    mark() {
      if (disposed || queue.length >= MAX_PENDING) return;
      const item: { start: number; state: WorkState } = { start: now(), state: "waiting" };
      queue.push(item);
      device.queue.onSubmittedWorkDone().then(
        () => {
          item.state = "done";
        },
        (error: unknown) => {
          item.state = "failed";
          if (disposed) return;
          failed += 1;
          lastError = error instanceof Error ? error.message.slice(0, 120) : String(error).slice(0, 120);
        },
      );
    },
    collect() {
      const done: number[] = [];
      const at = now();
      while (queue.length > 0) {
        const head = queue[0];
        if (!head || head.state === "waiting") break;
        queue.shift();
        if (head.state === "done") done.push(at - head.start);
      }
      return done;
    },
    pending: () => queue.length,
    failures: () => ({ count: failed, last: lastError }),
    dispose() {
      disposed = true;
      queue.length = 0;
    },
  };
}
