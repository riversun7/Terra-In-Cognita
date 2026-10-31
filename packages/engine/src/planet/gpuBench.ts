// [재기 모드] GPU 몫 재기 — ADR 2026-10-29-primary-map-sky 10절. 화면 주소 ?planet-sky-bench=<1|2|4>.
// 120Hz 화면에서 rAF 간격은 8.3ms로 묶여 작은 GPU 차이를 보이지 않고, 휴대폰에는 GPU 시간 확장이 거의 없다(Assumed).
// 그래서 프레임마다 장면을 k번 그리고 기본 그리기 버퍼에서 1화소를 읽어(gl.readPixels) GPU가 끝날 때까지 기다린 시간을 잰다.
// 읽기는 GPU를 멈춰 세우므로 재기 모드에서만 쓴다. 구름 굽기(R8 렌더 타깃)도 같은 읽기로 끝을 기다린다
// (three readRenderTargetPixels는 R8을 읽지 못한다 — ADR 9절).
import type { GpuBenchStats } from "./planetTypes.ts";

/** 최근 몇 프레임을 볼지 */
const SAMPLE_LIMIT = 120;
export const MIN_BENCH_REPEAT = 1;
export const MAX_BENCH_REPEAT = 4;

export class GpuBench {
  readonly repeat: number;
  private readonly gl: WebGLRenderingContext | WebGL2RenderingContext;
  private readonly pixel = new Uint8Array(4);
  private readonly samples: number[] = [];

  constructor(repeat: number, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.repeat = Math.min(MAX_BENCH_REPEAT, Math.max(MIN_BENCH_REPEAT, Math.round(repeat)));
    this.gl = gl;
  }

  /** GPU가 지금까지 받은 일을 끝낼 때까지 기다린다(기본 그리기 버퍼 1화소 읽기) */
  sync(): void {
    const gl = this.gl;
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pixel);
  }

  /** 그리기를 k번 하고 끝까지 기다린 시간을 적는다 */
  measure(draw: () => void): void {
    const started = performance.now();
    for (let i = 0; i < this.repeat; i++) draw();
    this.sync();
    this.samples.push(performance.now() - started);
    if (this.samples.length > SAMPLE_LIMIT) this.samples.shift();
  }

  summary(): GpuBenchStats {
    const sorted = [...this.samples];
    // oxlint-disable-next-line unicorn/no-array-sort -- 방금 만든 사본이다(toSorted는 지원 하한 Firefox 114에 없다)
    sorted.sort((a, b) => a - b);
    return {
      repeat: this.repeat,
      medianMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
      minMs: sorted[0] ?? 0,
      samples: sorted.length,
    };
  }
}
