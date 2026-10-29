// GPU가 프레임을 끝낸 때를 잰다 — render()로 제출한 뒤 GPU가 다 그릴 때까지(ms).
// 이유: WebGPU는 제출만 하고 바로 돌아온다. GPU가 못 따라와도 requestAnimationFrame은 계속 올 수 있어서
// 프레임 간격(fps)만 보면 GPU가 느린 것을 놓친다(헤드리스 SwiftShader에서 확인함). 완료 수/초가 실제 그린 양이다.
// - WebGL2: fenceSync를 넣고 다음 프레임마다 상태를 묻는다(기다리지 않는다). 지연은 프레임 간격 단위로 잰다.
// - WebGPU: queue.onSubmittedWorkDone() 약속이 풀릴 때.
// three를 가져오지 않는다(DOM API만). 두 방식 모듈이 함께 쓴다.

export interface GpuDoneTracker {
  /** render() 바로 뒤에 부른다 */
  mark(): void;
  /** 그 뒤 끝난 프레임들의 지연(ms)을 꺼낸다 */
  collect(): number[];
  /** 아직 안 끝난 수 */
  pending(): number;
  /** 완료 알림이 실패한 수와 마지막 오류(헤드리스 SwiftShader WebGPU는 모두 실패한다) */
  failures(): { count: number; last: string | null };
  dispose(): void;
}

/** 쌓인 표시 상한 — GPU가 아주 느려도 메모리가 늘지 않게(넘으면 가장 오래된 것을 버린다) */
const MAX_PENDING = 240;

export function webglDoneTracker(gl: WebGL2RenderingContext): GpuDoneTracker {
  const queue: { sync: WebGLSync; start: number }[] = [];
  return {
    mark() {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!sync) return;
      queue.push({ sync, start: performance.now() });
      if (queue.length > MAX_PENDING) {
        const oldest = queue.shift();
        if (oldest) gl.deleteSync(oldest.sync);
      }
    },
    collect() {
      const done: number[] = [];
      const now = performance.now();
      // 앞에서부터 차례로 끝난다(같은 큐)
      while (queue.length > 0) {
        const head = queue[0];
        if (!head || gl.getSyncParameter(head.sync, gl.SYNC_STATUS) !== gl.SIGNALED) break;
        done.push(now - head.start);
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

export function webgpuDoneTracker(device: GPUDevice): GpuDoneTracker {
  let done: number[] = [];
  let waiting = 0;
  let failed = 0;
  let lastError: string | null = null;
  let disposed = false;
  return {
    mark() {
      if (waiting >= MAX_PENDING) return;
      const start = performance.now();
      waiting += 1;
      device.queue.onSubmittedWorkDone().then(
        () => {
          waiting -= 1;
          if (!disposed) done.push(performance.now() - start);
        },
        (error: unknown) => {
          waiting -= 1;
          failed += 1;
          lastError = error instanceof Error ? error.message.slice(0, 120) : String(error).slice(0, 120);
        },
      );
    },
    collect() {
      const out = done;
      done = [];
      return out;
    },
    pending: () => waiting,
    failures: () => ({ count: failed, last: lastError }),
    dispose() {
      disposed = true;
      done = [];
    },
  };
}
