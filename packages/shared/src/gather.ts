// 2차맵 원자재 오브젝트 채집·건물 들어가기 조회 응답 모양(tRPC gather.*) — docs/adr/2026-11-07-gather-objects.md.
// 서버(apps/server/src/gather/)가 만들고 2차맵 화면(apps/game/src/map/gather/)이 읽는다. 바꾸는 명령은 WebSocket(프로토콜 17 gather_*·unit_enter)이다.

export type GatherStatus = "ok" | "not_ready" | "unknown_map";

/** 이름(ko·en) */
export interface GatherName {
  readonly ko: string;
  readonly en: string;
}

/** 오브젝트 종류 하나 */
export interface GatherKindView {
  readonly id: string;
  readonly name: GatherName;
  /** 나오는 아이템 ID와 이름(모르면 null) */
  readonly item: string;
  readonly itemName: GatherName | null;
  /** 가득일 때 캘 수 있는 번수·한 번 캘 때 묶음 수·기본 일(ms)·다시 자라는 기본 시간(ms) */
  readonly uses: number;
  readonly lots: number;
  readonly workMs: number;
  readonly regrowMs: number;
  /** 맡는 시설 ID와 이름(없으면 null) */
  readonly facility: string | null;
  readonly facilityName: GatherName | null;
  /**
   * 유닛이 직접 캘 수 있나. false = 맡는 시설의 일꾼만 쓴다(밭·목초지·물터 — docs/adr/2026-11-11-city-catchment.md). 없으면 직접 캔다(앞 판 응답)
   */
  readonly direct?: boolean;
  /**
   * 기기가 이 종류 오브젝트 자리에 세우는 소품 그림 번호(@terra/shared MAP_PROP_ARTS — 노두처럼 지형 파일에 없는 그림, 기획 D-534 질문 1083 나).
   * 없으면 지형 그림 그대로(앞 판 응답)
   */
  readonly art?: number;
  /** 배로만 닿는다(물 위 자리·물가에서 낚을 수 없는 어군 — 배는 아직 없다, 기획 D-536 질문 1221). 없으면 false(앞 판 응답) */
  readonly boat?: boolean;
  /**
   * 굴림표(기획 D-540 1222 나 — 난파선·고래 무리): 한 번 캘 때 이 가운데 하나(가중치 ‰). 있으면 item은 대표 아이템. 없으면 item 하나(앞 판 응답)
   */
  readonly table?: readonly {
    readonly item: string;
    readonly itemName: GatherName | null;
    readonly weightPm: number;
  }[];
  /**
   * 사다리 굴림(기획 D-540 1222 다 — 어군): 맡는 시설의 채집 사다리에서 캐는 유닛 스탯 띠로 티어를 뽑는다. 값 = 사다리(주 중분류) 이름.
   * 없으면 item 하나(앞 판 응답)
   */
  readonly ladderName?: GatherName;
  /** 사다리 굴림의 티어 범위(기획 D-541 — 질문 1307 나, 어군 종류마다): 뽑은 티어를 이 안으로 접는다. 없으면 막지 않는다(앞 판 응답) */
  readonly ladderTiers?: { readonly min: number; readonly max: number };
}

/**
 * 움직이는 어군 하나(기획 D-536): 번호(objects의 번호와 같다)와 길. 자리 = @terra/shared/fishSchool schoolPosition({points, periodMs,
 * phaseMs}, 서버 시각). objects 줄의 번호로는 자리를 풀지 않는다(배치 칸 번호 256² 밖)
 */
export interface GatherSchoolView {
  readonly id: number;
  /** 길 점(배치 칸 정수 x, y 번갈아) */
  readonly points: readonly number[];
  readonly periodMs: number;
  readonly phaseMs: number;
}

/** 오브젝트 한 칸의 값 수(objects 배열 걸음): [번호, 종류 차례, 남은 번수, 다시 자라는 시각(서버 ms, 0 = 자라는 중 아님)] */
export const GATHER_OBJECT_STRIDE = 4;

export interface GatherObjectsResponse {
  readonly status: GatherStatus;
  readonly mapKey: number;
  readonly kinds: readonly GatherKindView[];
  /** 오브젝트들(GATHER_OBJECT_STRIDE 걸음). 번호 = 기준 배치 칸 y × 256 + x */
  readonly objects: readonly number[];
  /** 움직이는 어군의 길(없으면 어군 없음 — 앞 판 응답) */
  readonly schools?: readonly GatherSchoolView[];
  readonly generatedAt: number;
}

/** 채집 줄 단계: 오브젝트로 가는 중·캐는 중·넣는 곳으로 가는 중·건물로 가는 중·끝 */
export type GatherPhase = "to_object" | "gathering" | "to_deposit" | "entering" | "done";

/** 끝난 까닭 */
export type GatherStop =
  /** 멈추기 명령 */
  | "stopped"
  /** 둘레 같은 종류 오브젝트가 모두 떨어졌다 */
  | "depleted"
  /** 넣는 곳이 가득 찼다 */
  | "storage_full"
  /** 피로가 상한에 닿았다 */
  | "tired"
  /** 다른 명령·전투 등으로 길에서 벗어났다 */
  | "interrupted"
  /** 설 곳·길이 없다 */
  | "no_path"
  /** 넣을 곳(시설·창고·도시)이 그 2차맵에 없다 */
  | "no_deposit"
  /** 들어가기를 마쳤다 */
  | "entered";

export type GatherDepositKind = "camp" | "storage" | "city";

/** 들어가기 결과: 화물 넣음·직무 받음·안에 머묾 */
export type GatherEnterResult = "deposited" | "assigned" | "inside";

/** 내 유닛 하나의 채집·들어가기 */
export interface GatherLoopView {
  readonly unitId: number;
  readonly mapKey: number;
  /** 채집: 오브젝트 번호와 종류 ID(들어가기는 null) */
  readonly objectId: number | null;
  readonly kindId: string | null;
  /** 들어가기: 건물 ID */
  readonly buildingId: number | null;
  readonly phase: GatherPhase;
  /** 이 줄로 캔 것만의 화물 무게(g)와 상한 */
  readonly carriedGrams: number;
  readonly capacityGrams: number;
  /** 지금 넣는 곳 종류(정하지 않았으면 null) */
  readonly deposit: GatherDepositKind | null;
  /** 이 줄로 캔 묶음 합·넣은 기본 단위 합 */
  readonly gatheredLots: number;
  readonly depositedUnits: number;
  /** 직접 채집이면 직접 배율, 시설 반경 안이면 시설 레벨 효율(‰) */
  readonly efficiencyPm: number;
  /** 다음 단계 시각(서버 ms, 모르면 null) */
  readonly nextAt: number | null;
  readonly stop: GatherStop | null;
  readonly enterResult: GatherEnterResult | null;
  readonly updatedAt: number;
}

export interface GatherLoopsResponse {
  readonly status: GatherStatus;
  readonly loops: readonly GatherLoopView[];
  readonly generatedAt: number;
}

/** 건물 안 유닛 하나 */
export interface GatherInsideUnit {
  readonly unitId: number;
  readonly own: boolean;
  /** 안에 들어온 까닭: 들어가기로 머묾·직무(배치·노동 계약) */
  readonly via: "inside" | "work";
}

/** 2차맵 건물 판 */
export interface GatherBuildingResponse {
  readonly status: GatherStatus | "unknown_building";
  readonly buildingId: number;
  readonly facilityId: string | null;
  readonly name: GatherName | null;
  readonly stage: string | null;
  readonly level: number;
  readonly mine: boolean;
  /** 내가 들어가면 화물을 넣을 수 있나(내 창고·시설·도시 시청) */
  readonly accepts: boolean;
  /** 내가 들어가면 직무를 받을 수 있나(내 채집 시설, 자리가 남음) */
  readonly hires: boolean;
  readonly inside: readonly GatherInsideUnit[];
  /** 부두가 만드는 중인 배(docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B2)"). 없으면 만드는 배 없음 */
  readonly boatJob?: { readonly startedAt: number; readonly readyAt: number } | undefined;
  readonly generatedAt: number;
}
