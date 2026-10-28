// 시험용 공용 자료 — 시험 파일끼리 서로 import하면 시험이 두 번 등록되므로 여기에 둔다
import type { PerfReport } from "@terra/protocol";

export const samplePerf: PerfReport = {
  clientBuild: "test",
  page: "/",
  windowSec: 60,
  frames: 3_600,
  fps: 60,
  frameP50Ms: 16.7,
  frameP95Ms: 18.2,
  frameMaxMs: 40,
  longFrames: 0,
  device: { screenW: 390, screenH: 844, dpr: 3 },
};
