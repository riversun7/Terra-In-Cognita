// 랭킹 시안 자료 — dev·admin이 시안 스위치를 켰을 때(홈과 같은 스위치, ADR 37 6절). 화면 검토·사진용이고 판정·보상에 쓰지 않는다.
// 이름은 가짜(시험용)이고 값은 고정이다(같은 요청 = 같은 응답).
import type { LocalizedName } from "@terra/shared/faction";
import {
  RANKING_BOARD_ROWS,
  type RankingBoardKey,
  type RankingBoardResponse,
  type RankingMineResponse,
  type RankingPathInfo,
  type RankingRow,
  type RankingSnapshotInfo,
  type RankingTierCut,
} from "@terra/shared/ranking";
import { type RankingCoefficients, tierPmOf } from "@terra/sim";

/** 시안 참가자 수와 내 순위 */
const PREVIEW_TOTAL = 1284;
const PREVIEW_ME_RANK = 63;
const PREVIEW_FACTION_TOTAL = 16;
const PREVIEW_MY_FACTION_RANK = 4;

function previewSnapshot(nowMs: number, c: RankingCoefficients): RankingSnapshotInfo {
  const periodMs = c.periodMs;
  const to = Math.floor(nowMs / periodMs) * periodMs;
  return {
    periodFromMs: to - periodMs,
    periodToMs: to,
    computedAtMs: to + 40_000,
    nextAtMs: to + periodMs,
    periodMs,
    decayPm: c.decayPm,
    tiersPm: c.tiersPm.toSorted((a, b) => a - b),
    topRanks: c.topRanks,
  };
}

const NAMES: readonly LocalizedName[] = [
  { ko: "새벽바다", en: "Dawnsea" },
  { ko: "철갑토끼", en: "Ironhare" },
  { ko: "고요한별", en: "Quietstar" },
  { ko: "모래여우", en: "Sandfox" },
  { ko: "푸른도토리", en: "Blueacorn" },
];
const FACTIONS: readonly LocalizedName[] = [
  { ko: "시험 국가 가람", en: "Test nation Garam" },
  { ko: "시험 국가 누리", en: "Test nation Nuri" },
  { ko: "시험 국가 다솜", en: "Test nation Dasom" },
  { ko: "시험 국가 라온", en: "Test nation Raon" },
];

const scoreAt = (rank: number): number => Math.max(1, Math.floor(98_000 / (1 + rank * 0.35)));

function tierCuts(total: number, c: RankingCoefficients): RankingTierCut[] {
  return c.tiersPm
    .toSorted((a, b) => a - b)
    .map((tierPm) => {
      const last = Math.floor((total * tierPm) / 1000);
      return { tierPm, minScore: last >= 1 ? scoreAt(last) : null };
    });
}

function userRow(rank: number, total: number, c: RankingCoefficients, me: boolean): RankingRow {
  const npc = rank % 4 === 2;
  const name = me ? { ko: "나의 사이보그", en: "My cyborg" } : (NAMES[rank % NAMES.length] ?? NAMES[0]);
  return {
    rank,
    prevRank: rank % 5 === 0 ? null : rank + ((rank % 3) - 1) * 2,
    kind: npc ? "npc_faction" : "user",
    name: npc ? (FACTIONS[rank % FACTIONS.length] ?? null) : (name ?? null),
    faction: npc ? null : (FACTIONS[(rank + 1) % FACTIONS.length] ?? null),
    score: scoreAt(rank),
    tierPm: tierPmOf(rank, total, c.tiersPm),
    top: rank <= c.topRanks,
    me,
    detail: null,
    preview: true,
  };
}

function factionRow(rank: number, c: RankingCoefficients, me: boolean): RankingRow {
  return {
    rank,
    prevRank: rank === 1 ? 1 : rank + (rank % 2 === 0 ? 1 : -1),
    kind: rank === 6 ? "player_faction" : "npc_faction",
    name: FACTIONS[rank % FACTIONS.length] ?? null,
    faction: null,
    score: scoreAt(rank * 9),
    tierPm: tierPmOf(rank, PREVIEW_FACTION_TOTAL, c.tiersPm),
    top: rank <= c.topRanks,
    me,
    // 명성: 위 12개 세력만 쌓았다(나머지는 "아직 없음")
    detail: {
      cities: Math.max(1, 14 - rank),
      humans: Math.max(10, 420 - rank * 23),
      renown: rank <= 12 ? (17 - rank) * 30 : null,
    },
    preview: true,
  };
}

export function previewBoard(
  board: RankingBoardKey,
  paths: readonly RankingPathInfo[],
  c: RankingCoefficients,
  nowMs: number,
): RankingBoardResponse {
  const base = {
    generatedAt: nowMs,
    preview: true,
    snapshot: previewSnapshot(nowMs, c),
    paths,
    board,
    renown: null,
  };
  if (board.kind === "faction") {
    const rows = Array.from({ length: PREVIEW_FACTION_TOTAL }, (_, index) =>
      factionRow(index + 1, c, index + 1 === PREVIEW_MY_FACTION_RANK),
    );
    return {
      ...base,
      status: "ready",
      total: PREVIEW_FACTION_TOTAL,
      rows,
      me: rows.find((row) => row.me) ?? null,
      tiers: tierCuts(PREVIEW_FACTION_TOTAL, c),
    };
  }
  const path = paths.find((entry) => entry.id === board.path);
  const status = path === undefined ? "unknown" : path.open ? "ready" : "closed";
  if (status !== "ready") return { ...base, status, total: 0, rows: [], me: null, tiers: tierCuts(0, c) };
  if (board.kind === "house") {
    // 가문 판 시안: 유저 줄 모양에 가문 표시(소속 도시·가문원 수)
    const houses = Array.from(
      { length: PREVIEW_FACTION_TOTAL },
      (_, index): RankingRow => ({
        ...userRow(index + 1, PREVIEW_FACTION_TOTAL, c, index + 1 === PREVIEW_MY_FACTION_RANK),
        kind: "house",
        prevRank: null,
        home: index % 3 === 0 ? null : `Preview City ${(index % 5) + 1}`,
        members: 20 - (index % 17),
      }),
    );
    return {
      ...base,
      status,
      total: PREVIEW_FACTION_TOTAL,
      rows: houses,
      me: houses.find((row) => row.me) ?? null,
      tiers: tierCuts(PREVIEW_FACTION_TOTAL, c),
    };
  }
  const rows = Array.from({ length: RANKING_BOARD_ROWS }, (_, index) =>
    userRow(index + 1, PREVIEW_TOTAL, c, index + 1 === PREVIEW_ME_RANK),
  );
  return {
    ...base,
    status,
    total: PREVIEW_TOTAL,
    rows,
    me: userRow(PREVIEW_ME_RANK, PREVIEW_TOTAL, c, true),
    tiers: tierCuts(PREVIEW_TOTAL, c),
  };
}

export function previewMine(
  paths: readonly RankingPathInfo[],
  c: RankingCoefficients,
  nowMs: number,
): RankingMineResponse {
  const open = paths.filter((path) => path.open);
  return {
    generatedAt: nowMs,
    preview: true,
    snapshot: previewSnapshot(nowMs, c),
    paths,
    standings: open.map((path, index) => {
      const rank = PREVIEW_ME_RANK * (index + 1) * 3;
      return {
        path: path.id,
        standing: {
          rank,
          prevRank: rank + 4,
          total: PREVIEW_TOTAL,
          score: scoreAt(rank),
          gain: Math.floor(scoreAt(rank) / 40),
          tierPm: tierPmOf(rank, PREVIEW_TOTAL, c.tiersPm),
          top: false,
        },
      };
    }),
    faction: {
      name: FACTIONS[PREVIEW_MY_FACTION_RANK % FACTIONS.length] ?? null,
      standing: {
        rank: PREVIEW_MY_FACTION_RANK,
        prevRank: PREVIEW_MY_FACTION_RANK + 1,
        total: PREVIEW_FACTION_TOTAL,
        score: scoreAt(PREVIEW_MY_FACTION_RANK * 9),
        gain: 0,
        tierPm: tierPmOf(PREVIEW_MY_FACTION_RANK, PREVIEW_FACTION_TOTAL, c.tiersPm),
        top: PREVIEW_MY_FACTION_RANK <= c.topRanks,
      },
      detail: { cities: 10, humans: 328, renown: (17 - PREVIEW_MY_FACTION_RANK) * 30 },
    },
    renown: null,
  };
}
