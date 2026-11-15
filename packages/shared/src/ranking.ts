// 랭킹 전송 타입·고정 목록 — 기획 20 §8(D-034~D-043·D-047), D-392(경로 랭킹은 공개 여부 표시가 있는 자료, 안 연 것은 "곧 열림"),
// D-6010(랭킹은 따로 메뉴가 아니라 사이보그·세력 화면 안), D-7018·D-7022(성과는 넣고 시간제 수치는 뺀다), D-499·질문 394(세력 명성 +
// 유저 명성, 화면은 랭킹 줄기). 결정·기본안은 docs/adr/2026-11-07-ranking.md.
// 진입점은 @terra/shared/ranking이다. 첫 화면 묶음에 들어가지 않게 index.ts에서 내보내지 않는다(ADR 37 11절).
// - 셈(감쇠형 점수·백분위 등급·순위)은 서버가 집계 때 한다. 기기는 받은 값을 그리기만 한다(서버 권위).
// - 콘텐츠 팩(packages/content `ranking_paths`)도 이 목록을 쓴다(경로가 재는 것 = RANKING_MEASURES 가운데에서 고른다).
import type { LocalizedName } from "./faction.ts";

/** 경로의 영역 7개(20 §7.2 차례: 무력·생명·부·기술·개척·영향력·생활) */
export const RANKING_AREAS = ["force", "life", "wealth", "tech", "frontier", "influence", "living"] as const;
export type RankingArea = (typeof RANKING_AREAS)[number];

/**
 * 서버가 원장·전투 기록·세계 표에서 바로 셀 수 있는 지표(D-392 "지표가 원장·전투 기록에서 바로 나오는 경로부터"). 경로는 이 가운데
 * 몇 개를 가중치와 함께 고른다. 새 지표는 끝에 더한다(팩이 이름으로 가리킨다).
 * - war_wins: 전쟁 전투 승리 × 상대 전력비(언더독, D-042 ①). 흐름(집계 기간 안)
 * - battle_wins: 전쟁이 아닌 전투 승리(웨이브 방어 포함) × 상대 전력비. 흐름
 * - cities_held: 가진 도시(도시마다 1 + 발전도 ÷ 100) — 집계마다 "유지 일수"만큼 쌓인다(로그, D-042 ④). 재고
 * - production: 산출 원장 항목의 양 합(로그). 흐름
 * - facilities: 지은 시설의 레벨 × 상태(로그) — 가동·내구 유지. 재고
 */
export const RANKING_MEASURES = [
  "war_wins",
  "battle_wins",
  "cities_held",
  "production",
  "facilities",
] as const;
export type RankingMeasure = (typeof RANKING_MEASURES)[number];

export function isRankingMeasure(value: unknown): value is RankingMeasure {
  return typeof value === "string" && (RANKING_MEASURES as readonly string[]).includes(value);
}

/**
 * 화면이 고르는 판: 경로 하나(유저·세력 주체마다) · 세력 판 · 경로 하나의 가문 판(D-569 1746 "랭킹은 가문별 유닛별 모두 존재" — 가문원 점수의
 * 합, 가문마다 한 줄, 소속 도시 표시)
 */
export type RankingBoardKey =
  | { readonly kind: "path"; readonly path: string }
  | { readonly kind: "faction" }
  | { readonly kind: "house"; readonly path: string };

/** 판 요청: 경로를 비우면(null) 서버가 고른다 — 내 점수가 가장 높은 경로, 없으면 연 경로의 첫째 */
export type RankingBoardRequest =
  | { readonly kind: "path"; readonly path: string | null }
  | { readonly kind: "faction" }
  | { readonly kind: "house"; readonly path: string | null };

/** 판에 오른 주체의 종류: 유저(사이보그) · NPC 세력 · 유저 세력(D-043: NPC도 같은 판에 같은 규칙으로) · 가문(가문 판) */
export type RankingSubjectKind = "user" | "npc_faction" | "player_faction" | "house";

/** 경로 하나(팩 자료). 안 연 경로는 지표가 없어도 된다(D-392 "곧 열림") */
export interface RankingPathInfo {
  readonly id: string;
  readonly name: LocalizedName;
  readonly area: RankingArea;
  readonly open: boolean;
  /** 재는 것과 가중치(‰). 화면은 "무엇을 재나" 줄에 쓴다 */
  readonly measures: readonly { readonly measure: RankingMeasure; readonly weightPm: number }[];
}

/** 마지막 집계(스냅숏) 정보. 셈 규칙 값(감쇠·등급 문턱)은 그 집계 때의 설정 칸 값이다 */
export interface RankingSnapshotInfo {
  /** 집계한 기간 [from, to) */
  readonly periodFromMs: number;
  readonly periodToMs: number;
  readonly computedAtMs: number;
  /** 다음 집계 경계(to + 주기). 서버는 그 뒤 1분 안에 센다 */
  readonly nextAtMs: number;
  readonly periodMs: number;
  /** 집계마다 줄어드는 몫(‰, D-037 감쇠형) */
  readonly decayPm: number;
  /** 백분위 등급 문턱(‰, 오름차순, D-041 예 1·5·20·50%) */
  readonly tiersPm: readonly number[];
  /** 최상위 표시 순위(1…n, D-041 "최상위 순위에는 별도 혜택" — 혜택 내용은 미정) */
  readonly topRanks: number;
}

/** 내 자리(한 판) */
export interface RankingStanding {
  readonly rank: number;
  /** 지난 집계의 순위(없으면 처음 오름) */
  readonly prevRank: number | null;
  /** 점수가 있는 참가자 수 */
  readonly total: number;
  readonly score: number;
  /** 이번 집계에 더한 점수 */
  readonly gain: number;
  /** 든 백분위 등급 문턱(‰). 어느 문턱에도 들지 않으면 null(등급 밖) */
  readonly tierPm: number | null;
  readonly top: boolean;
}

/** 세력 판 한 줄의 덧붙임: 규모와 세력 명성(정원사 2가 쌓은 값, 쌓은 적 없으면 null — 점수에 더하지 않는다) */
export interface RankingFactionDetail {
  readonly cities: number;
  readonly humans: number;
  readonly renown: number | null;
}

/** 판 한 줄 */
export interface RankingRow {
  readonly rank: number;
  readonly prevRank: number | null;
  readonly kind: RankingSubjectKind;
  /** 이름: 유저 = 사이보그 이름(D-134, 두 언어 같은 값), 세력 = 국가 프리셋 이름 또는 서버 코드. 모르면 null(화면 "이름 없음") */
  readonly name: LocalizedName | null;
  /** 유저 줄의 소속 세력 이름(없으면 null) */
  readonly faction: LocalizedName | null;
  readonly score: number;
  readonly tierPm: number | null;
  readonly top: boolean;
  readonly me: boolean;
  /** 세력 판에만 */
  readonly detail: RankingFactionDetail | null;
  /** 가문 판에만: 소속 도시 이름(이름 없는 도시·모르면 null)과 점수를 더한 가문원 수 */
  readonly home?: string | null | undefined;
  readonly members?: number | undefined;
  /** 시안 자료(dev·admin이 켰을 때)면 true */
  readonly preview?: boolean | undefined;
}

/** 등급 문턱마다 그 등급에 드는 가장 낮은 점수(참가자가 없으면 null) */
export interface RankingTierCut {
  readonly tierPm: number;
  readonly minScore: number | null;
}

/** ranking.board 응답 — 판 하나(위 N줄 + 내 줄) */
export interface RankingBoardResponse {
  readonly generatedAt: number;
  readonly preview: boolean;
  /** null = 아직 집계 전(서버가 켜진 뒤 첫 집계를 기다림) */
  readonly snapshot: RankingSnapshotInfo | null;
  /** 판 고르기 목록(팩 차례) */
  readonly paths: readonly RankingPathInfo[];
  readonly board: RankingBoardKey;
  /** ready = 판이 있음, closed = 아직 안 연 경로(곧 열림), unknown = 없는 경로 ID */
  readonly status: "ready" | "closed" | "unknown";
  readonly total: number;
  readonly rows: readonly RankingRow[];
  /** 내 줄(위 N줄에 있어도 같은 값을 다시 보낸다). 판에 없으면 null */
  readonly me: RankingRow | null;
  readonly tiers: readonly RankingTierCut[];
  /** 유저 명성(내 자리 칸, D-499 → 질문 394 "다"). 유저에게 명성을 쌓는 곳이 아직 없어 null — ADR 확인 대기 */
  readonly renown: number | null;
}

/** 경로마다 내 자리(사이보그 화면 랭킹 칸·랭킹 화면 머리) */
export interface RankingPathStanding {
  readonly path: string;
  readonly standing: RankingStanding | null;
}

/** ranking.mine 응답 — 내 경로 자리 + 내 세력 자리 + 명성 칸 */
export interface RankingMineResponse {
  readonly generatedAt: number;
  readonly preview: boolean;
  readonly snapshot: RankingSnapshotInfo | null;
  readonly paths: readonly RankingPathInfo[];
  /** 점수가 있는 경로만, 점수 높은 순(질문 134 가 → D-443) */
  readonly standings: readonly RankingPathStanding[];
  /** 내 세력(없으면 null)과 세력 판 자리(판에 없으면 null) */
  readonly faction: {
    readonly name: LocalizedName | null;
    readonly standing: RankingStanding | null;
    readonly detail: RankingFactionDetail | null;
  } | null;
  /** 유저 명성(D-499 → 질문 394 "다"). 유저에게 명성을 쌓는 곳이 아직 없어 null — ADR 확인 대기 */
  readonly renown: number | null;
}

/** 판 줄 수 상한([임시] 옛 랭킹 화면 LIMIT 50, D-507 — AntiGravt01 terra-server/routes/ranking/ranking_routes.js) */
export const RANKING_BOARD_ROWS = 50;
