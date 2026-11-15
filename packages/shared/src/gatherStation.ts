// 채집소 판 응답 모양(tRPC gather.station) — 사용자 지적(2026-11-08) "원자재채집소의 기능도 필요",
// docs/adr/2026-11-07-gather-objects.md "바뀜 (2026-11-08 사용자 지적: 채집소 기능)".
// 서버(apps/server/src/gather/stationReads.ts)가 만들고 2차맵 건물 판(apps/game/src/map/gather/StationPanel.tsx)·건물 화면
// (apps/game/src/economy/StationParts.tsx)이 읽는다. 바꾸는 명령은 이미 있는 WebSocket 명령이다: 일꾼 = labor_assign·labor_unassign,
// 레벨 올리기 = facility_upgrade, 도시 창고로 옮기기 = storage_move(out), 내 유닛 보내기 = gather_start.

/** 이름(ko·en) */
export interface StationName {
  readonly ko: string;
  readonly en: string;
}

export type GatherStationStatus = "ok" | "not_ready" | "unknown_building" | "not_station";

/**
 * 채집소 종류: objects = 반경 안 원자재 오브젝트를 쓰는 채집소(벌목장·광산 — 오브젝트·반경·버프·채집소 창고),
 * facility = 오브젝트 없이 시설로만 하는 채집 시설(농장 등 — 채집소 창고·수확·피로 버프, 반경·다시 자람 없음. 기획 정리 756 ②)
 */
export type GatherStationKind = "objects" | "facility";

/** 레벨 하나의 버프: 반경(배치 칸)·수확·피로·다시 자람 배율(‰, 1000 = 그대로) */
export interface GatherStationBuffs {
  /** 반경(배치 칸). facility 채집소(오브젝트 없음)는 null */
  readonly radiusCells: number | null;
  readonly yieldPm: number;
  readonly fatiguePm: number;
  /** 다시 자람 배율. facility 채집소(오브젝트 없음)는 null */
  readonly regrowPm: number | null;
}

/** 일꾼 상태: 일함·쉼(피로)·오브젝트 없음·창고 가득·시설이 일하지 않음·2차맵 밖·아직 정산 전 */
export type GatherStationWorkerState =
  | "working"
  | "resting"
  | "no_objects"
  | "storage_full"
  | "stopped"
  | "away"
  | "waiting";

export interface GatherStationWorker {
  readonly unitId: number;
  /** assign = 직무 배치, wage·lease = 노동 계약 */
  readonly via: "assign" | "wage" | "lease";
  /** 내 유닛인가 */
  readonly mine: boolean;
  readonly state: GatherStationWorkerState;
  /** 서버를 켠 뒤 이 채집소에서 끝낸 묶음 수(메모리) */
  readonly lots: number;
  /** 피로(직무 상태, 상한 = fatigueMax) */
  readonly fatigue: number;
  /** 마지막으로 정산된 시각(서버 ms, 없으면 null) */
  readonly settledAtMs: number | null;
  /**
   * 쉬는 곳(질문 1088 가 — 플레이어 일꾼도 그 도시 숙소의 빈 침대에서 NPC 일꾼과 같은 규칙으로 회복, 없으면 집). 숙소 회복을 껐거나 도시 밖이면
   * null·없음(예전 규칙)
   */
  readonly rest?: GatherStationWorkerRest | null | undefined;
}

/** 일꾼 하나가 쉬는 곳과 회복 배율 */
export interface GatherStationWorkerRest {
  readonly kind: "lodging" | "home";
  /** 숙소 레벨(집이면 0) */
  readonly level: number;
  /** 회복 배율(‰, 1000 = 숙소 없는 집 기본) */
  readonly recoveryPm: number;
}

/** 반경 안 오브젝트 합 */
export interface GatherStationObjects {
  /** 이 채집소가 맡는 오브젝트 종류 ID(팩 차례) */
  readonly kinds: readonly string[];
  readonly total: number;
  /** 캘 수 있는 것·떨어져 다시 자라는 것 */
  readonly ready: number;
  readonly depleted: number;
  /** 남은 번수 합·가득일 때 번수 합 */
  readonly usesLeft: number;
  readonly usesMax: number;
  /** 가장 먼저 다시 자라는 시각(서버 ms, 없으면 null) */
  readonly nextRegrowAtMs: number | null;
}

/** 채집소 창고의 물건 한 줄 */
export interface GatherStationGoods {
  readonly asset: string;
  /** 물자면 아이템 ID */
  readonly item: string | null;
  readonly name: StationName | null;
  /** 내 몫(원장 기본 단위, 10진 글자)·무게(g, 10진 글자) */
  readonly qty: string;
  readonly grams: string;
}

/** 다음 레벨 비용(건물 레벨업과 같은 식 — 재료는 그 도시 창고·창고 시설·이 2차맵 화물에서) */
export interface GatherStationUpgrade {
  readonly level: number;
  readonly materials: readonly {
    readonly item: string;
    readonly name: StationName | null;
    readonly qty: number;
    /** 재료 자리에 내가 가진 수 */
    readonly have: number;
  }[];
  readonly timeMs: number;
  /** 다음 레벨의 버프(미리 보기) */
  readonly buffs: GatherStationBuffs | null;
}

/**
 * 건물 채집소(농장·목장·약초원 — 선택 방식, 기획 D-566 1721·D-567) 면적 모듈과 기르는 티어. 다른 채집소는 null
 */
export interface GatherStationPlots {
  /** 붙은 면적 모듈 수 */
  readonly count: number;
  /** 붙일 수 있는 수(레벨 × 레벨당 자리) */
  readonly slots: number;
  /** 지금 면적 배율(‰, 1000 + 모듈 수 × 모듈 몫) */
  readonly areaPm: number;
  /** 모듈 하나가 더하는 몫(‰) */
  readonly perPlotPm: number;
  /** 기르는 티어 = 건물 레벨의 최고 티어(2 × 레벨 − 1) */
  readonly tier: number;
  /** 그 티어의 권장 스탯 합(주 + 보조, 미달이면 수확 효율이 준다) */
  readonly recommendedStat: number;
  /** 다음 모듈 재료(내 채집소이고 자리가 남았을 때만, 그 시설 레벨 1 짓기 재료) */
  readonly materials: GatherStationUpgrade["materials"] | null;
}

export interface GatherStationResponse {
  readonly status: GatherStationStatus;
  readonly buildingId: number;
  readonly kind: GatherStationKind | null;
  readonly facilityId: string | null;
  readonly name: StationName | null;
  readonly level: number;
  readonly maxLevel: number;
  readonly mine: boolean;
  readonly mapKey: number | null;
  /** 건물 기준 칸(반경을 그리는 가운데) */
  readonly x: number;
  readonly y: number;
  /** 건물이 선 도시(창고로 옮기는 곳, 없으면 null) */
  readonly cityId: number | null;
  /** 다 지었고 일하는가(상태 문턱) */
  readonly works: boolean;
  /** 지금 레벨 버프(facility 채집소는 반경·다시 자람이 null) */
  readonly buffs: GatherStationBuffs | null;
  readonly objects: GatherStationObjects | null;
  /** 채집소 창고: 상한·든 무게(g, 모든 주인)·내 몫 물건. 상한이 없으면 capacityGrams null */
  readonly storage: {
    readonly capacityGrams: string | null;
    readonly usedGrams: string;
    readonly goods: readonly GatherStationGoods[];
  };
  /**
   * 자동 옮김(두 종류 모두): 간격(ms, 0 = 끔)·다음 시각(서버 ms, 끔·도시 없음이면 null).
   * 옮김 거리(질문 1050 가): cells = 채집소 → 창고(창고가 없으면 도시 칸, toStore false) 칸, tripMs = 지금 든 내 몫을 나르는 시간(ms, 거리 셈을
   * 끄면 0), arriveAtMs = 나르는 중이면 닿는 시각. 도시 밖이면 cells·tripMs null
   */
  readonly haul: {
    readonly everyMs: number;
    readonly nextAtMs: number | null;
    readonly cells?: number | null | undefined;
    readonly toStore?: boolean | undefined;
    readonly tripMs?: number | null | undefined;
    readonly arriveAtMs?: number | null | undefined;
    /** 나르는 중이면 운반꾼 유닛 ID(질문 1090 가 — 그 채집소 일꾼 하나가 화물을 지고 걷는다) */
    readonly porterUnitId?: number | null | undefined;
  };
  readonly slots: number;
  readonly workers: readonly GatherStationWorker[];
  /** 피로 상한(N21) */
  readonly fatigueMax: number;
  /** 레벨 올리는 중이면 끝 시각(서버 ms) */
  readonly upgradingUntilMs: number | null;
  /** 다음 레벨(내 채집소이고 더 올릴 수 있을 때만) */
  readonly upgrade: GatherStationUpgrade | null;
  /** 건물 채집소 면적 모듈·기르는 티어(D-567). 다른 채집소는 null(옛 서버는 칸이 없다) */
  readonly plots?: GatherStationPlots | null | undefined;
  readonly generatedAt: number;
}
