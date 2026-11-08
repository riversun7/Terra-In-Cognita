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
 * 채집소 종류: objects = 반경 안 원자재 오브젝트를 쓰는 채집소(벌목장·광산 — 오브젝트·버프·채집소 창고),
 * facility = 오브젝트 없이 시설로만 하는 채집 시설(농장 등 — 일꾼·레벨만, 산출은 예전처럼 도시 창고)
 */
export type GatherStationKind = "objects" | "facility";

/** 레벨 하나의 버프: 반경(배치 칸)·수확·피로·다시 자람 배율(‰, 1000 = 그대로) */
export interface GatherStationBuffs {
  readonly radiusCells: number;
  readonly yieldPm: number;
  readonly fatiguePm: number;
  readonly regrowPm: number;
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
  /** 지금 레벨 버프(objects 채집소만, 아니면 null) */
  readonly buffs: GatherStationBuffs | null;
  readonly objects: GatherStationObjects | null;
  /** 채집소 창고: 상한·든 무게(g, 모든 주인)·내 몫 물건. 상한이 없으면 capacityGrams null */
  readonly storage: {
    readonly capacityGrams: string | null;
    readonly usedGrams: string;
    readonly goods: readonly GatherStationGoods[];
  };
  /** 자동 옮김: 간격(ms, 0 = 끔)·다음 시각(서버 ms, 끔·도시 없음이면 null) */
  readonly haul: { readonly everyMs: number; readonly nextAtMs: number | null };
  readonly slots: number;
  readonly workers: readonly GatherStationWorker[];
  /** 피로 상한(N21) */
  readonly fatigueMax: number;
  /** 레벨 올리는 중이면 끝 시각(서버 ms) */
  readonly upgradingUntilMs: number | null;
  /** 다음 레벨(내 채집소이고 더 올릴 수 있을 때만) */
  readonly upgrade: GatherStationUpgrade | null;
  readonly generatedAt: number;
}
