// 미리보기 레벨별 메모리 추정 — ADR 38 4절 "결과마다 넘긴 배열 바이트(정확한 값)와 레벨별 최대 추정치(Node에서 잰 표,
// "추정"이라고 적음)를 상태 칩에 보인다". 브라우저 워커는 자기 메모리를 읽을 수 없다(performance.memory 없음, 설계 R1).
// 화면은 이 표의 값을 늘 "추정"으로 적는다. 결과가 오면 남는 바이트는 결과의 outputBytes(정확한 값)를 쓴다.
//
// 출처(2026-10-29 잼): Node 24.22.1, 개발 컨테이너(4코어 공유, 부하 평균 6~7), main 5b37544의 생성기(출력 판 2)로
//   편집기 워커 핵심(previewWork.ts runPreviewJob)을 콘텐츠 팩 s2_test_planet 정의로 레벨마다 새 프로세스에서 돌렸다.
//   workerPeakMiB = 단계 끝마다 잰 process.memoryUsage().arrayBuffers(GC 전, 시작 값 뺌)의 최댓값.
//   keptBytes = 같은 실행의 outputBytes(넘긴 버퍼 합, 결과 해시는 생성기 골든 해시와 같았다).
//   스크립트: 저장소 밖 임시(작업 기록 docs/worklog/2026/10/29-2013-planet-editor-core.md에 수치와 조건).
//   JS 힙·워커 자체 몫은 들어 있지 않다. 생성기 판이 바뀌면(출력·중간 배열) 다시 잰다.

export interface MemoryEstimate {
  readonly level: number;
  /** 워커가 생성 중 잡는 타입 배열 최대(바이트, 추정) */
  readonly workerPeakBytes: number;
  /** 결과가 화면 스레드에 남기는 바이트(잰 값. 실제 결과는 outputBytes를 쓴다) */
  readonly keptBytes: number;
}

const MIB = 1024 * 1024;

/** 잰 값(레벨, 워커 최대 MiB, 남는 바이트) */
const MEASURED: readonly (readonly [level: number, workerPeakMiB: number, keptBytes: number])[] = [
  [4, 0.56, 24_336],
  [5, 1.2, 95_676],
  [6, 3.85, 379_548],
  [7, 11.36, 1_512_060],
  [8, 45.56, 6_036_156],
  [9, 165.51, 24_120_636],
];

export const MEMORY_ESTIMATES: readonly MemoryEstimate[] = MEASURED.map(
  ([level, workerPeakMiB, keptBytes]) => ({
    level,
    workerPeakBytes: Math.round(workerPeakMiB * MIB),
    keptBytes,
  }),
);

/** 레벨의 추정(표에 없는 레벨이면 null) */
export function memoryEstimate(level: number): MemoryEstimate | null {
  return MEMORY_ESTIMATES.find((estimate) => estimate.level === level) ?? null;
}
