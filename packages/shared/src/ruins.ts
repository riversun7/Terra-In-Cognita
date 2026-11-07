// 폐허 복원 조회 모양(tRPC ruins.overview) — 기획 D-510·D-339·D-343·D-344, docs/adr/2026-11-07-ruins-restoration.md.
// 웨이브에 무너진 도시는 폐허로 남고, 그 2차맵에 정부(행정 건물)를 먼저 지은 쪽이 주인이 되어 복원 사업을 연다(목표를 채우면 도시가 되살아나고
// 낸 값만큼 도시 지분). 바꾸는 명령은 WebSocket facility_build(행정 건물)·restoration_open·restoration_fund·dev_make_ruin(프로토콜 13)이다.
// 금액은 10진 문자열(최소 단위)이다.
// 폐허 2(기획 답 480 다·485 다·487 다·489 다): 정부 건물 상태(짓는 중·서 있음·0%·사라짐 — 다 지어야 모금을 열고 넣는다, 0%·사라지면 다시 지은
// 쪽이 주인)·모금 기한·행정 건물 최대 레벨(되살아난 도시의 행정 레벨 = 그 건물 레벨).
import type { LocalizedName } from "./roster.ts";

/** 세력 이름(나라 프리셋 이름이 있으면 그 이름, 없으면 코드) */
export interface RuinFactionView {
  readonly code: string | null;
  readonly name: LocalizedName | null;
}

/** 지분 미리 셈 한 줄(지금 목표를 채우면) */
export interface RuinShareView {
  /** 소유 주체(나 = mine) */
  readonly mine: boolean;
  readonly label: string;
  readonly shares: number;
}

/** 정부 건물 상태: building = 짓는 중, up = 다 지어 서 있음, down = 0%(폐허)·사라짐 */
export interface RuinHallView {
  readonly state: "building" | "up" | "down";
  /** 지금 레벨(짓는 중·사라짐이면 0) */
  readonly level: number;
}

/** 폐허 하나 */
export interface RuinView {
  readonly id: number;
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
  readonly ruinedAtMs: number;
  readonly formerOwner: RuinFactionView | null;
  /** 주인 없음 = null. 주인이 나면 mine */
  readonly owner: {
    readonly mine: boolean;
    /** 유저 주인(사이보그 이름) 또는 세력 주인 */
    readonly label: string;
    /** 복원하면 도시가 드는 세력 */
    readonly joins: RuinFactionView | null;
    /** 정부 건물(유저가 지은 것). NPC 주인은 null(건물 없이 값으로 지어 늘 서 있다) */
    readonly hall: RuinHallView | null;
  } | null;
  /** 복원 사업(주인이 있을 때) */
  readonly project: {
    readonly goal: string;
    readonly raised: string;
    readonly currency: string;
    /** 모금이 열렸나(열리면 누구나 넣는다) */
    readonly open: boolean;
    /** 내가 낸 값 */
    readonly mine: string;
    /** 내가 넣을 수 있나(정부 건물이 서 있고 기한 전, 주인이거나 모금이 열림) */
    readonly canFund: boolean;
    /** 정부 건물이 다 지어지고 서 있나(아니면 모금을 열지도 넣지도 못한다, 480 다) */
    readonly ready: boolean;
    /** 모금 기한(ms, 지나면 하루 끝에 낸 값을 돌려주고 주인 없음 — 485 다). null = 기한 없음 */
    readonly deadlineAtMs: number | null;
    /** 지금 목표를 채우면 나눌 지분(많은 차례, 내 몫 포함) */
    readonly shares: readonly RuinShareView[];
  } | null;
  /** 정부 짓기 자리 제안(주인이 없거나 정부 건물이 0%·사라졌을 때, 빈 칸을 찾았으면) */
  readonly buildAt: { readonly x: number; readonly y: number } | null;
}

export interface RuinsOverviewResponse {
  /** not_ready = 세계·NPC 사회 런타임이 아직 없다(목록은 비어 있다) */
  readonly status: "ready" | "not_ready";
  readonly ruins: readonly RuinView[];
  /** 정부(행정 건물) 시설: 이름·최대 레벨(되살아난 도시의 행정 레벨 = 그 건물 레벨, 489 다)·레벨 1 재료(없으면 null) */
  readonly government: {
    readonly facilityId: string;
    readonly name: LocalizedName;
    readonly maxLevel: number;
    readonly materials: readonly {
      readonly item: string;
      readonly name: LocalizedName;
      readonly qty: number;
    }[];
  } | null;
  /** 내 화폐 잔고(복원 사업 화폐 — 서버 시험 화폐) */
  readonly balance: string;
  readonly currency: string;
  readonly hasCyborg: boolean;
  /** 개발 시험 단추(dev·admin) */
  readonly dev: boolean;
  readonly generatedAt: number;
}
