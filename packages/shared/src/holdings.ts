// 보유 물건(아이템 인스턴스) 조회 모양 — tRPC holdings.list(docs/adr/2026-11-03-item-holdings.md 4절).
// 바꾸는 명령(입기·벗기·쓰기·개발 받기)은 WebSocket(@terra/protocol items.ts)이다. 수치는 서버가 셈해 보낸다(기기는 셈하지 않는다).
import type { LocalizedName } from "./roster.ts";

/** 보유 모양: 장비 하나하나·신선도 묶음·쌓이는 소모품(그 밖 물자는 원장 economy.holdings) */
export type HoldingKindView = "instance" | "lot" | "stack";

/** 쓰기 쿨 종류(D-509 물약 30초·D-510 요리 5분) */
export type HoldingCooldownKind = "potion" | "food";

/** 쓰는 효과 한 줄(실효 정의 — 효과량은 쓸 때 서버가 굴린다, D-501) */
export interface HoldingUseView {
  readonly effect: string;
  readonly name: LocalizedName | null;
  /** 지속(ms, 0 = 전투 중 한 번 — 전투 밖에서는 battle_only) */
  readonly durationMs: number;
}

/** 굴린 스탯 하나(값과 범위 안 자리 ‰) */
export interface HoldingStatView {
  readonly stat: string;
  readonly value: number;
  readonly pm: number;
}

export interface HoldingView {
  readonly id: number;
  readonly item: string;
  /** 실효 팩 이름(팩에서 사라진 아이템이면 null) */
  readonly name: LocalizedName | null;
  /** 지금 정의의 모양(팩에서 사라졌으면 null) */
  readonly kind: HoldingKindView | null;
  readonly quantity: number;
  /** 들고 있는 유닛(없으면 null) */
  readonly unit: number | null;
  /** 창고 위치(없으면 null) */
  readonly place: number | null;
  /** 입은 칸 번호(그 유닛 칸 배치 차례, 없으면 null = 듦) */
  readonly slot: number | null;
  readonly stats: readonly HoldingStatView[];
  /** 등급 점수(D-5006, 만든 직후 값 ‰) */
  readonly scorePm: number | null;
  readonly durability: number | null;
  readonly maxDurability: number | null;
  /** 지금 신선도(‰, 신선도 묶음만) */
  readonly freshnessPm: number | null;
  /** 그 자리에 그대로 두면 썩는 시각(UTC ms, 멈춤·신선도 없음이면 null) */
  readonly spoilsAt: number | null;
  readonly createdAt: number;
  /** 얻은 길(dev_grant·craft·drop·gather·spoil 등) */
  readonly source: string;
  /** 입는 칸 종류(장비 정의의 칸, 장비가 아니거나 팩에서 사라졌으면 null). 옛 서버는 보내지 않는다 */
  readonly equipSlot?: string | null | undefined;
  /** 쓰기 쿨 종류(쓸 수 있는 물건만, 아니면 null). 옛 서버는 보내지 않는다 */
  readonly useCooldown?: HoldingCooldownKind | null | undefined;
  /** 쓰는 효과(쓸 수 있는 물건만). 옛 서버는 보내지 않는다 */
  readonly uses?: readonly HoldingUseView[] | undefined;
}

/** 유닛 칸 배치(slot 번호 = 차례, 팩 unit_kinds) — 화면이 칸 번호를 칸 종류로 읽는다 */
export interface HoldingUnitView {
  readonly unit: number;
  /** 팩 unit_kinds ID(사이보그 = cyborg, 그 밖 세계 유닛 = human) */
  readonly kind: string;
  readonly slots: readonly string[];
}

/** 유닛에 걸린 효과 하나(소모품 사용, D-501) */
export interface UnitEffectView {
  readonly unit: number;
  readonly effect: string;
  readonly name: LocalizedName | null;
  readonly value: number;
  readonly until: number;
  readonly exclusive: string | null;
  readonly item: string;
  /** 값 단위(flat = 그대로, permille = ‰). 옛 서버는 보내지 않는다 */
  readonly valueMode?: "flat" | "permille" | undefined;
}

/** 유닛 쓰기 쿨 하나(D-509: 물약은 전투·비전투 같은 쿨) */
export interface UnitCooldownView {
  readonly unit: number;
  /** potion(물약, 30초) · food(요리, 5분) */
  readonly kind: string;
  readonly until: number;
}

export interface HoldingsListResponse {
  /** 월드에 이 계정의 소유 주체가 있는지(없으면 아직 아무것도 없다) */
  readonly hasOwner: boolean;
  readonly holdings: readonly HoldingView[];
  readonly effects: readonly UnitEffectView[];
  /** 아직 끝나지 않은 쓰기 쿨 */
  readonly cooldowns: readonly UnitCooldownView[];
  /** 내 사이보그 유닛(없으면 null). 옛 서버는 보내지 않는다 */
  readonly cyborgUnit?: number | null | undefined;
  /** 칸 배치: 내 사이보그 유닛 + 물건을 든 유닛(유닛 ID 차례). 옛 서버는 보내지 않는다 */
  readonly units?: readonly HoldingUnitView[] | undefined;
}
