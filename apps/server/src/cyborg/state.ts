// 사이보그 자료 — 부팅 때 DB에서 읽고(쓰기 대기열이 돌기 전), 바뀌면 월드 쓰기 대기열로 쓴다.
// docs/adr/2026-11-01-first-login-cyborg.md 2절·"바뀜 (D-450~D-453)". int8은 pg가 문자열로 주므로 숫자로 바꾼다. smallint[]는
// 숫자 배열로 온다. 속성값(elements)이 null이면 아직 나누지 않은 사이보그다(프로토콜 5 전에 만든 것, 한 번 나눈다).
// 옛 2D 외형 정리(기획 D-560 1421 "옛 2D 자료 바로 정리", docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-15, D-560 1421)"):
// - 메모리 자료에는 3D 외형(look)만 둔다. 옛 칸 appearance는 읽기만 하고 쓰지 않는다(쓰기 줄은 늘 null — DB 열은 다음 배포에서 지운다).
// - 3D 외형이 없는 옛 줄은 읽을 때 옛 외형에서 넘긴 3D 외형(사용자 ID 씨앗 — 늘 같은 답)으로 채우고 look_auto(한 번 무료로 고를 수 있음, 질문
//   961 나)를 켠다. 옛 칸이 남은 줄은 legacyLooks에 담아 서비스가 켤 때 한 번 다시 쓴다(appearance = null, look 채움) — 다음에 켜면 할 일이 없다
//   (켤 때 도는 멱등 옮기기, 세계를 새로 시작하지 않는다).
import {
  type CharacterLook,
  characterLookFromLegacy,
  characterSeedOf,
  isCharacterLook,
} from "@terra/shared/characterLook";
import {
  DEFAULT_CYBORG_APPEARANCE,
  type ElementValues,
  elementsFromArray,
  elementsToArray,
  isCyborgAppearance,
} from "@terra/shared/cyborg";
import type { Primaries } from "@terra/sim";
import type { QueryPool } from "../world/persist/load.ts";
import type { Row } from "../world/persist/tables.ts";

export interface CyborgRecord {
  readonly userId: string;
  readonly name: string;
  readonly nameKey: string;
  readonly temperament: string;
  readonly initial: Primaries;
  readonly kPm: Primaries;
  /** 3D 외형(docs/adr/2026-11-11-character-3d.md 5절) — 모든 사이보그가 가진다(옛 2D 외형만 있던 줄은 읽을 때 넘겨 채운다) */
  look: CharacterLook;
  /**
   * 3D 외형을 서버가 옛 2D 외형에서 넘겨 채웠나(DB look_auto). 그런 사이보그는 한 번 무료로 고를 수 있다(chooseLook, 질문 961 나 — 고르면 false가
   * 되고 다시 켜지지 않는다)
   */
  lookAuto: boolean;
  /** 지금 나라(세력 행 ID). 가문이 도시·국가에 가입하면 맞춰진다(미소속이면 null — ADR 2026-11-24-house-membership-separation.md) */
  factionId: number | null;
  /** 내 도시(첫 접속 시작 도시, 귀화하면 귀화한 도시 — 구인 기본 도시·거래소 기본 도시·본체를 다시 놓는 곳) */
  startCityId: number;
  unitId: number | null;
  /** 레벨과 그 레벨 구간 안의 경험치(채집 경험치가 올린다 — docs/adr/2026-11-26-gather-exp.md, service.ts addExp) */
  level: number;
  exp: number;
  readonly rebirths: number;
  /** 신앙도(D-451: 쌓이는 문턱 점수, 0~100). 신전 기도·헌금이 올린다(docs/adr/2026-11-07-temple-religion.md) */
  faith: number;
  readonly createdAtMs: number;
  /** 생성·환생 속성값(D-450). null = 아직 나누지 않음(한 번 나누면 채운다) */
  elements: ElementValues | null;
  /** 종교 코드(D-451, 지금은 고르는 길이 없어 null) */
  readonly religion: string | null;
  /** 신앙 포인트(D-451) */
  faithPoints: number;
  /**
   * 받은 정착 지원금(D-455 190: 강하 때, D-456: 지원금 전에 만든 사이보그는 한 번 속성 분배 때). null = 아직 받지 않음
   */
  startGrant: bigint | null;
  /** 마지막으로 국적을 바꾼 시각(쉬는 날, 표 nationality_changes의 가장 늦은 at_ms). 바꾼 적이 없으면 null */
  nationChangedAtMs: number | null;
  /** 나라(세력 행 ID)별 우호도(D-526, 표 user_nation_standings, −100~100). 줄이 없는 나라는 0(보통) */
  readonly standings: Map<number, number>;
  /**
   * 나라(세력 행 ID)별 명성(D-326, 표 user_nation_renown, 0 이상). 작위 = 명성 구간(D-571 지휘관 정원). 줄이 없는 나라는 0. 옛 시험 자료처럼
   * 칸이 없으면 서비스가 처음 쌓을 때 만든다
   */
  renown?: Map<number, number> | undefined;
}

export interface RollRecord {
  readonly userId: string;
  readonly temperament: string;
  readonly stats: Primaries;
  readonly rollsUsed: number;
  readonly seed: number;
  readonly updatedAtMs: number;
}

/** 가입할 수 있는 세력 후보(고정 NPC 세력, D-140·D-341). 시작 도시는 world_cities에서 따로 읽는다 */
export interface JoinableFaction {
  readonly id: number;
  readonly code: string | null;
  /** 그 나라가 정한 귀화 조건(D-526, + 입회비 / − 지원금). null·없음 = 설정 칸 기본값 */
  readonly naturalizeFee?: bigint | null | undefined;
}

export interface LoadedCyborgs {
  readonly cyborgs: CyborgRecord[];
  readonly rolls: RollRecord[];
  readonly factions: JoinableFaction[];
  /** 옛 2D 외형이 남아 켤 때 다시 쓸 사이보그(사용자 ID — 3D 외형을 채우고 옛 칸을 비운다, D-560 1421) */
  readonly legacyLooks: readonly string[];
}

const STAT_ORDER = ["str", "dex", "agi", "vit", "int", "wis"] as const;

/** STR·DEX·AGI·VIT·INT·WIS 차례 배열 ↔ 스탯 객체 */
export function statsToArray(stats: Primaries): number[] {
  return STAT_ORDER.map((stat) => stats[stat]);
}

export function statsFromArray(value: unknown): Primaries {
  const list = Array.isArray(value) ? value.map(Number) : [];
  const at = (index: number): number => {
    const v = list[index];
    return v !== undefined && Number.isInteger(v) ? v : 0;
  };
  return { str: at(0), dex: at(1), agi: at(2), vit: at(3), int: at(4), wis: at(5) };
}

const num = (value: unknown): number => Number(value);
/** int8은 pg가 문자열로 준다 */
const bigOrNull = (value: unknown): bigint | null =>
  typeof value === "string" || typeof value === "number" || typeof value === "bigint" ? BigInt(value) : null;
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

export async function loadCyborgs(pool: QueryPool): Promise<LoadedCyborgs> {
  const [cyborgRows, rollRows, factionRows, nationRows, standingRows, renownRows] = await Promise.all([
    pool.query(
      `select user_id, name, name_key, temperament, initial, k_pm, appearance, look, look_auto, faction_id, start_city_id,
              unit_id, level, exp, rebirths, faith, created_at_ms, elements, religion, faith_points, start_grant
         from cyborgs order by created_at_ms, user_id`,
    ),
    pool.query(`select user_id, temperament, stats, rolls_used, seed, updated_at_ms from cyborg_rolls`),
    pool.query(
      `select id, code, naturalize_fee from factions where kind = 'npc' and fixed = true order by id`,
    ),
    // 국적 바꾸기 기록(docs/adr/2026-11-08-citizenship.md): 사용자마다 마지막 바꾼 시각(쉬는 날)
    pool.query(`select user_id, max(at_ms) as last_at from nationality_changes group by user_id`),
    // 사람·나라 우호도(D-526)
    pool.query(`select user_id, faction_id, score from user_nation_standings`),
    // 사람·나라 명성(D-326 작위, D-571)
    pool.query(`select user_id, faction_id, renown from user_nation_renown`),
  ]);
  const renown = new Map<string, Map<number, number>>();
  for (const row of renownRows.rows) {
    const user = String(row.user_id);
    const map = renown.get(user) ?? new Map<number, number>();
    map.set(num(row.faction_id), num(row.renown));
    renown.set(user, map);
  }
  const nations = new Map<string, number>();
  for (const row of nationRows.rows) nations.set(String(row.user_id), num(row.last_at));
  const standings = new Map<string, Map<number, number>>();
  for (const row of standingRows.rows) {
    const user = String(row.user_id);
    const map = standings.get(user) ?? new Map<number, number>();
    map.set(num(row.faction_id), num(row.score));
    standings.set(user, map);
  }
  const legacyLooks: string[] = [];
  const cyborgs = cyborgRows.rows.map((row): CyborgRecord => {
    const userId = String(row.user_id);
    // 3D 외형: 저장한 것, 없거나 맞지 않으면(목록에서 빠진 ID 등) 옛 2D 외형에서 넘긴 값(옛 칸도 맞지 않으면 기본 2D 외형에서)
    const stored = isCharacterLook(row.look) ? row.look : null;
    const legacy = isCyborgAppearance(row.appearance) ? row.appearance : DEFAULT_CYBORG_APPEARANCE;
    const look = stored ?? characterLookFromLegacy(legacy, characterSeedOf(userId));
    const lookAuto = stored === null || row.look_auto === true;
    // 옛 칸이 남았거나 3D 외형을 채웠으면 켤 때 한 번 다시 쓴다
    if (stored === null || (row.appearance !== null && row.appearance !== undefined))
      legacyLooks.push(userId);
    return {
      userId: String(row.user_id),
      name: String(row.name),
      nameKey: String(row.name_key),
      temperament: String(row.temperament),
      initial: statsFromArray(row.initial),
      kPm: statsFromArray(row.k_pm),
      look,
      lookAuto,
      factionId: numOrNull(row.faction_id),
      startCityId: num(row.start_city_id),
      unitId: numOrNull(row.unit_id),
      level: num(row.level),
      exp: num(row.exp),
      rebirths: num(row.rebirths),
      faith: num(row.faith),
      createdAtMs: num(row.created_at_ms),
      elements: row.elements === null || row.elements === undefined ? null : elementsFromArray(row.elements),
      religion: typeof row.religion === "string" ? row.religion : null,
      faithPoints: num(row.faith_points ?? 0),
      startGrant: bigOrNull(row.start_grant),
      nationChangedAtMs: nations.get(String(row.user_id)) ?? null,
      standings: standings.get(String(row.user_id)) ?? new Map<number, number>(),
      renown: renown.get(String(row.user_id)) ?? new Map<number, number>(),
    };
  });
  const rolls = rollRows.rows.map(
    (row): RollRecord => ({
      userId: String(row.user_id),
      temperament: String(row.temperament),
      stats: statsFromArray(row.stats),
      rollsUsed: num(row.rolls_used),
      seed: num(row.seed),
      updatedAtMs: num(row.updated_at_ms),
    }),
  );
  const factions = factionRows.rows.map(
    (row): JoinableFaction => ({
      id: num(row.id),
      code: typeof row.code === "string" ? row.code : null,
      naturalizeFee: bigOrNull(row.naturalize_fee),
    }),
  );
  return { cyborgs, rolls, factions, legacyLooks };
}

/** 보이는 3D 외형(늘 있다 — 옛 2D만 있던 줄은 읽을 때 넘겨 채웠다) */
export function cyborgLookOf(record: Pick<CyborgRecord, "look">): CharacterLook {
  return record.look;
}

/** 쓰기 대기열 한 줄(cyborgs) */
export function cyborgRow(record: CyborgRecord): Row {
  return {
    user_id: record.userId,
    name: record.name,
    name_key: record.nameKey,
    temperament: record.temperament,
    initial: statsToArray(record.initial),
    k_pm: statsToArray(record.kPm),
    // 옛 2D 외형 칸은 쓰지 않는다(D-560 1421 — 열은 다음 배포에서 지운다)
    appearance: null,
    look: record.look,
    look_auto: record.lookAuto,
    faction_id: record.factionId,
    start_city_id: record.startCityId,
    unit_id: record.unitId,
    level: record.level,
    exp: record.exp,
    rebirths: record.rebirths,
    faith: record.faith,
    created_at_ms: record.createdAtMs,
    elements: record.elements === null ? null : elementsToArray(record.elements),
    religion: record.religion,
    faith_points: record.faithPoints,
    start_grant: record.startGrant,
  };
}

/** 쓰기 대기열 한 줄(cyborg_rolls) */
export function rollRow(record: RollRecord): Row {
  return {
    user_id: record.userId,
    temperament: record.temperament,
    stats: statsToArray(record.stats),
    rolls_used: record.rollsUsed,
    seed: record.seed,
    updated_at_ms: record.updatedAtMs,
  };
}
