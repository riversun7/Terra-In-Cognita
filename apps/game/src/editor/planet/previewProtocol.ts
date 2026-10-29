// 행성 편집기 미리보기 워커와 화면 스레드가 주고받는 말 — ADR 38 "3. 미리보기 (기기 워커)"
// 화면 → 워커: 일 하나(생성기 입력 + 기억 열쇠). 워커 → 화면: 단계 알림(여러 번), 결과 또는 실패(한 번).
// 결과 배열은 복사하지 않고 넘긴다(transfer). 맨 고운 단계(레벨 F)는 생성기 배열을 그대로 쓰므로(aggregatePlanetLevels)
// 같은 버퍼가 두 번 나온다 → 넘길 목록은 Set으로 겹침을 뺀다(같은 버퍼가 두 번 있으면 넘기기가 실패한다).
// 이 파일은 타입과 넘길 목록 도우미만 둔다(생성기를 가져오지 않는다): 화면 쪽 조각에 생성기 본체가 들어가지 않게.
import type { PlanetLevel } from "@terra/planet";
import type { GeneratorStage, PlanetFields, PlanetGeneratorInput } from "@terra/planet/generator";

/** 미리보기 일의 단계: 생성기 단계 + 요약 + 단계별 모으기(맵 레벨 F−4~F와 꼭짓점 높이) */
export type PreviewStage = GeneratorStage | "summary" | "levels";

/**
 * 결과 요약 자리 — 생성기 도우미(WP-A)의 면적 가중 요약(summarizePlanet)이 들어오면 그 결과 타입으로 바꾼다.
 * 지금 워커는 요약을 만들지 않는다(null). 구조화 복제로 넘길 수 있는 값이어야 한다
 */
export type PreviewSummary = Readonly<Record<string, unknown>>;

/** 화면 → 워커: 생성기 입력 하나를 미리보기 결과로 */
export interface PreviewRequest {
  readonly kind: "generate";
  /** 일 번호(화면이 매긴다, 늘 새 번호) */
  readonly id: number;
  /** 결과 기억 열쇠(previewKey) — 결과에 그대로 돌려준다 */
  readonly key: string;
  readonly input: PlanetGeneratorInput;
}

/** 워커가 만든 결과(넘긴 배열 포함) */
export interface PreviewResultData {
  /** 생성 결과(면 레벨 F = 미리보기 레벨). 메타에 생성기 판·결과 해시가 있다 */
  readonly fields: PlanetFields;
  /** 1차맵 5단계 칸 값(맵 레벨 오름차순 F−4 … F). 맨 끝은 fields 배열을 그대로 쓴다 */
  readonly levels: readonly PlanetLevel[];
  /** 단계마다의 꼭짓점 높이(levels와 같은 순서, planetCornerHeights) */
  readonly corners: readonly Int16Array[];
  /** 면적 가중 요약(WP-A 전에는 null) */
  readonly summary: PreviewSummary | null;
  /** 해수면(실제 환산 m) */
  readonly seaLevelRealM: number;
  /** 가장 높은 칸(게임 m) — 엔진 행성 설명의 maxElevationM */
  readonly maxElevationM: number;
  /** 워커 안에서 잰 시간(ms): 생성기만, 일 전체(요약·모으기 포함) */
  readonly generateMs: number;
  readonly workerMs: number;
  /** 넘긴 배열 바이트(겹침을 뺀 버퍼 크기의 합, 정확한 값) — 이 결과가 화면 스레드에 남기는 크기 */
  readonly outputBytes: number;
}

/** 실패 코드: rejected = 생성기가 받지 않는 입력(validatePlanetInput), failed = 생성 중 오류 */
export type PreviewFailureCode = "rejected" | "failed";

/** 워커 → 화면 */
export type PreviewReply =
  | { readonly kind: "stage"; readonly id: number; readonly stage: PreviewStage }
  | { readonly kind: "result"; readonly id: number; readonly key: string; readonly result: PreviewResultData }
  | {
      readonly kind: "error";
      readonly id: number;
      readonly key: string;
      readonly code: PreviewFailureCode;
      /** 기록용 문장(화면에 쓰지 않는다) */
      readonly message: string;
    };

/** 결과를 넘길 버퍼 목록(겹침 없음). 공유 메모리(SharedArrayBuffer)는 넘길 수 없어 뺀다 */
export function previewTransferables(result: PreviewResultData): ArrayBuffer[] {
  const { fields, levels, corners } = result;
  const views: ArrayBufferView[] = [
    fields.elevationM,
    fields.biome,
    fields.temperatureC,
    fields.precipitationMm,
    fields.humidity,
    fields.water,
    fields.river,
    fields.forest,
    ...corners,
  ];
  for (const level of levels) {
    views.push(
      level.elevationM,
      level.biome,
      level.temperatureC,
      level.humidity,
      level.forest,
      level.water,
      level.river,
    );
  }
  const buffers = new Set<ArrayBuffer>();
  for (const view of views) if (view.buffer instanceof ArrayBuffer) buffers.add(view.buffer);
  return [...buffers];
}

/** 넘길 버퍼 크기의 합(바이트) */
export function transferredBytes(buffers: readonly ArrayBuffer[]): number {
  let total = 0;
  for (const buffer of buffers) total += buffer.byteLength;
  return total;
}
