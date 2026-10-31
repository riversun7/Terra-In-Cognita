// 세력 화면 응답 만들기(faction.overview) — 실제 자료(소유 주체·세력 소속·잔고)와 시안 자료를 화면 한 장의 모양으로 묶는다(D-439).
// - 실제 자료: 내 몫(늘), 소속 세력 요약(있으면). 도시·외교·전쟁·정권·지분·점령은 규칙(R4b) 전이라 not_ready(화면 "곧 열림").
// - 시안 자료(dev·admin이 켰을 때): 세력 요약과 여섯 칸을 시안 장면으로 채우고 preview를 붙인다. 내 몫은 그대로 실제 자료다.
// - 잠긴 메뉴(D-5055, S32)는 도시 수로 서버가 정해 보낸다. 조건 값은 [임시] 출발값이다(아래 LOCK_RULES).
import type {
  FactionOverviewResponse,
  FactionRef,
  FactionSection,
  FactionSummary,
  LockableFeature,
  LockedFeature,
  MySummary,
} from "@terra/shared/faction";
import type { FactionScreenServices, HomeQuery } from "../trpc/context.ts";
import {
  previewCities,
  previewDiplomacy,
  previewFaction,
  previewOccupations,
  previewRegime,
  previewShares,
  previewWars,
} from "./preview.ts";
import { type FactionMembership, type FactionReal, type FactionSource, NO_FACTION_REAL } from "./source.ts";

/**
 * 잠긴 메뉴 조건(S32 "기능별 잠금 조건"). [임시] 출발값:
 * - 화폐 발행·세율: 도시 1개 이상(D-213 해석 "도시가 없으면 화폐 발행·세율 메뉴가 잠긴다", D-299)
 * - 국가 채권: 도시 5개 이상(D-5055 해석, D-130 출발값). 신용도 조건은 값이 없어 아직 넣지 않았다(질문 158)
 */
export const LOCK_RULES: readonly { readonly feature: LockableFeature; readonly citiesMin: number }[] = [
  { feature: "currency_issue", citiesMin: 1 },
  { feature: "tax_rate", citiesMin: 1 },
  { feature: "national_bond", citiesMin: 5 },
];

/** 도시 수 → 기능마다 열림과 조건 */
export function evaluateLocks(cityCount: number): LockedFeature[] {
  return LOCK_RULES.map(({ feature, citiesMin }) => {
    const met = cityCount >= citiesMin;
    return {
      feature,
      open: met,
      requirements: [{ kind: "cities_min", need: citiesMin, current: cityCount, met }],
    };
  });
}

const NOT_READY = { status: "not_ready" } as const;

function preview<T>(data: T): FactionSection<T> {
  return { status: "ready", data, preview: true };
}

/** DB 세력 → 화면 이름. 세력 이름 칸이 아직 없어(S3 최소 표) 서버 코드나 번호를 쓴다 [임시] */
function factionRef(entry: { id: number; kind: FactionMembership["kind"]; code: string | null }): FactionRef {
  return { id: `faction_${entry.id}`, name: entry.code ?? `#${entry.id}`, tag: null, kind: entry.kind };
}

/** 실제 소속 → 세력 요약. 도시 표가 아직 없어 도시 수 0(= 가문·세력 단계), 체제·지도자·가문은 모른다(null) */
function realSummary(membership: FactionMembership): FactionSummary {
  return {
    ...factionRef(membership),
    stage: "faction",
    regime: null,
    leader: null,
    memberCount: membership.memberCount,
    cityCount: 0,
    joinedAt: membership.joinedAt,
    family: null,
    overlord: membership.parent === null ? null : { faction: factionRef(membership.parent), tributePm: null },
    vassals: [],
    currency: null,
    treasury: membership.treasury,
  };
}

function mySummary(real: FactionReal): MySummary {
  const owner = real.owner;
  return {
    hasOwner: owner !== null,
    units: owner?.units ?? 0,
    buildings: owner?.buildings ?? 0,
    balances: owner?.balances ?? [],
  };
}

/** 응답 한 장. preview면 세력·여섯 칸이 시안 자료다 */
export function buildFactionOverview(real: FactionReal, query: HomeQuery): FactionOverviewResponse {
  const { now } = query;
  const me = mySummary(real);
  if (query.preview) {
    const faction = previewFaction(now);
    return {
      generatedAt: now,
      preview: true,
      stage: faction.stage,
      me,
      faction,
      locks: evaluateLocks(faction.cityCount),
      cities: preview(previewCities()),
      diplomacy: preview(previewDiplomacy(now)),
      wars: preview(previewWars(now)),
      regime: preview(previewRegime(now)),
      shares: preview(previewShares(now)),
      occupations: preview(previewOccupations(now)),
    };
  }
  const faction = real.faction === null ? null : realSummary(real.faction);
  return {
    generatedAt: now,
    preview: false,
    stage: faction === null ? "individual" : faction.stage,
    me,
    faction,
    locks: faction === null ? [] : evaluateLocks(faction.cityCount),
    cities: NOT_READY,
    diplomacy: NOT_READY,
    wars: NOT_READY,
    regime: NOT_READY,
    shares: NOT_READY,
    occupations: NOT_READY,
  };
}

/** source: 실제 자료 출처(DB·월드가 있을 때 app.ts가 만든다). 없으면 실제 자료는 빈 값이다 */
export function createFactionScreenServices(
  options: { source?: FactionSource | undefined } = {},
): FactionScreenServices {
  const source = options.source;
  return {
    overview: async (viewer, query) =>
      buildFactionOverview(source ? await source.load(viewer.id, query.now) : NO_FACTION_REAL, query),
  };
}
