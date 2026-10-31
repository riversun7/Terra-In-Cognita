// 편집기 2차맵 미리보기 워커와 화면 스레드가 주고받는 말 — ADR 2026-10-31-second-map-from-planet 9절(ADR 38 D6a)
// 화면 → 워커: 행성 생성기 입력(행성 진짜 면 레벨) + 2차맵 키 + 소품 규칙(map_props 원본 항목). 워커 → 화면: 단계 알림, 결과 또는 실패.
// 워커는 마지막 행성 값을 들고 있다가 같은 행성(planetKey)이면 다시 쓴다(행성 F9 약 10~20초, 2차맵 약 0.1초).
// 결과 배열은 복사하지 않고 넘긴다(transfer). 이 파일은 타입만 둔다(생성기를 가져오지 않는다).
import type { PlanetGeneratorInput } from "@terra/planet/generator";
import type { MapPreset, PlanetCellValues } from "@terra/planet/secondMap";

/** 화면 → 워커 */
export interface SecondMapPreviewRequest {
  readonly kind: "secondMap";
  /** 일 번호(화면이 매긴다, 늘 새 번호) */
  readonly id: number;
  /** 행성 값 열쇠(previewKey(input)) — 같으면 워커가 들고 있는 행성 값을 다시 쓴다 */
  readonly planetKey: string;
  /** 행성 생성기 입력(면 레벨 = 행성 정의의 면 레벨). 없으면 definition으로 워커가 만든다 */
  readonly input?: PlanetGeneratorInput | undefined;
  /**
   * 행성 원본 항목 + 팩 바이옴 항목 + 면 레벨(개발자 2차맵 시험): 워커가 생성기 입력을 만든다. 화면 조각이 생성기를 가져오지 않게
   * (개발자 도구 둘이 같이 쓰는 조각에 생성기가 들면 미리 캐시 검사에 걸린다)
   */
  readonly definition?:
    | { readonly entry: unknown; readonly biomes: readonly unknown[]; readonly faceLevel: number }
    | undefined;
  /** 2차맵 키 = 행성 면 레벨 칸의 셀 키. null이면 preset으로 워커가 찾는다 */
  readonly mapKey: number | null;
  /** 시험 자리 종류(개발자 2차맵 시험): mapKey가 null일 때 행성 값에서 찾는다(@terra/planet/secondMap findMapPreset) */
  readonly preset?: MapPreset | undefined;
  /** 8이웃 2차맵도 만든다(개발자 2차맵 시험 3×3) */
  readonly neighbours?: boolean | undefined;
  /** 콘텐츠 map_props 원본 항목(팩 파일 JSON, 팩 순서 = 흩기 우선순위) */
  readonly props: readonly unknown[];
}

/** 단계: 행성 만들기(같은 행성이면 건너뛴다) → 2차맵 만들기 */
export type SecondMapPreviewStage = "planet" | "map";

/** 워커가 만든 2차맵(생성기 SecondMapTerrain에서 화면이 쓰는 것) */
export interface SecondMapPreviewTerrain {
  readonly mapKey: number;
  readonly generatorVersion: number;
  /** 꼭짓점 높이(cm) 129² */
  readonly heightsCm: Int32Array;
  /** 꼭짓점 물 높이(cm, 물 없음 = 생성기 NO_WATER = 지형 파일 TERRAIN_NO_WATER) 129² */
  readonly waterLevelCm: Int32Array;
  /** 지형 칸 지표 128² */
  readonly surface: Uint8Array;
  /** 배치 칸 엄폐 값 256² */
  readonly cover: Uint8Array;
  /** 배치 칸 소품 그림 번호 256² */
  readonly art: Uint8Array;
  /** 지형 칸 한 변(mm) */
  readonly cellSizeMm: number;
  /** 결과 해시(16진수 8자리) — 서버 지형과 같은 값이어야 한다(같은 코드·같은 입력) */
  readonly hash: string;
}

export interface SecondMapPreviewResult {
  readonly terrain: SecondMapPreviewTerrain;
  /** 그 2차맵(면 레벨 칸)의 행성 값: 바이옴·기온·습도 등 */
  readonly cell: PlanetCellValues;
  /** neighbours를 부탁했으면 8이웃(면 칸 이웃이 있는 것만) */
  readonly neighbours: readonly SecondMapPreviewTerrain[];
  /** 행성 생성 시간(ms). 들고 있던 행성 값을 다시 썼으면 null */
  readonly planetMs: number | null;
  /** 2차맵 생성 시간(ms, 소품 규칙 풀기 포함) */
  readonly mapMs: number;
}

/** 실패 코드: rejected = 받지 않는 입력(행성 정의·소품 규칙), failed = 생성 중 오류, none = 그 종류에 맞는 자리가 없다 */
export type SecondMapPreviewFailureCode = "rejected" | "failed" | "none";

/** 워커 → 화면 */
export type SecondMapPreviewReply =
  | { readonly kind: "stage"; readonly id: number; readonly stage: SecondMapPreviewStage }
  | { readonly kind: "result"; readonly id: number; readonly result: SecondMapPreviewResult }
  | {
      readonly kind: "error";
      readonly id: number;
      readonly code: SecondMapPreviewFailureCode;
      /** 기록용 문장(화면에 쓰지 않는다) */
      readonly message: string;
    };
