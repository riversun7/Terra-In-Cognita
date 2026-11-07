// 사이보그 만들기·상태 — docs/adr/2026-11-01-first-login-cyborg.md 1~4절, 기획 D-096·D-134·D-140·D-6039~D-6041·D-218·D-445.
// 서버 권위: 굴림 값·남은 횟수(cyborg_rolls), 이름 규칙·고유(메모리 표가 먼저, DB 유일 색인이 뒤), 외형 ID, 세력·도시, 놓을 자리.
// - 굴리기: 성향 확인 → 남은 횟수 → crypto 시드로 굴림 → 메모리·쓰기 대기열 → 커밋 뒤 답(소유·물건과 같다, S3 U2).
// - 만들기: 한 번의 동기 처리로 소유 주체·세계 유닛(종류 3, 시작 도시 둘레)·사이보그 행·세력 가입·굴림 지우기를 대기열에 넣고
//   커밋 뒤 답한다(한 커밋이라 "사이보그는 있는데 유닛이 없다"가 저장에서 생기지 않는다).
// - 부팅: 유닛 행이 없는 사이보그(옛 시험 2차맵 정리 등)를 시작 도시에 다시 놓는다(불변 조건 I13).
// - 속성 분배(D-450, N36): 만들 때 4원소 가운데 두 칸까지 합 10(@terra/shared checkElementAllocation). 분배 없이 온 만들기(4판 기기)는
//   "분배 기다림"(elements null)으로 만들고, 그런 사이보그(프로토콜 5 전에 만든 것 포함)는 allocateElements로 한 번 나눈다.
//   다시 나누기는 환생 때다(@terra/sim rebirthCyborg). 5판 연결은 만들기에 분배를 꼭 보낸다(gateway.ts가 본다).
// - 생활비(D-453): 본체도 유닛 유지비를 내고(world/settlement.ts), 못 냈으면 livingUnpaid가 참 → 화면 효율 불이익(N38).
// - 정착 지원금(D-455 190, N39): 만들기와 같은 동기 처리에서 그 세력 국고 → 사용자 주체로 한 번 옮긴다(원장 거래 settlement_grant,
//   중복 방지 키 settlement_grant:<사용자>, 사이보그 행 start_grant에 기록 — 세력을 바꿔도 다시 주지 않는다). 새 화폐를 만들지 않는다:
//   국고가 모자라면 국고에 있는 만큼만 준다. [임시] 세력 화폐가 서버에 없어 국고의 시험 화폐(유지비와 같은 자산)로 낸다.
//   지원금 전에 만든 사이보그(start_grant null)는 다음 접속의 한 번 속성 분배 때 같은 키로 한 번 받는다(D-456).
// - 시작 재료(docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산", 질문 520): 같은 동기 처리에서 첫 건물 재료(설정 칸 [임시] 소나무 원목·석재
//   개수)를 그 시작 도시의 내 도시 창고(원장 위치 = 도시 ID)에 넣는다. 생산원 source:item:<ID>에서 나온다(시뮬 시작 물자·개발 재료와 같은
//   계정). 원장 거래 start_goods, 중복 방지 키 start_goods:<사용자>. 지원금 전에 만든 사이보그에는 주지 않는다.
// 쓰는 프로세스는 하나다(ADR 3): 메모리 표가 원본의 캐시이고, 같은 스레드라 두 요청이 같은 값을 보지 않는다.
import type {
  CreationFaction,
  CyborgCreationResponse,
  CyborgNameCheckResponse,
  CyborgRollView,
  CyborgStatusResponse,
} from "@terra/shared/cyborg";
import { checkElementAllocation, isCyborgAppearance, parseCyborgName } from "@terra/shared/cyborg";
import { cityLocation } from "@terra/shared/goodsPlaces";
import type { LocalizedName } from "@terra/shared/roster";
import type { CyborgResultCode, CyborgRollWire } from "@terra/protocol";
import { createRng } from "@terra/shared";
import {
  type SocietyCoefficients,
  TEST_SOCIETY_COEFFICIENTS,
  WALK_SPEED,
  addDevotion,
  firstStatRoll,
  kFromRolls,
  rerollStats,
  settlementGrant,
  temperamentOf,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { CyborgReadServices } from "../trpc/context.ts";
import type { CityRow } from "../world/cities.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { ASSET_CREDIT, type Settlement } from "../world/settlement.ts";
import { UNIT_KIND_CYBORG } from "../world/unitKinds.ts";
import {
  type CyborgRecord,
  type JoinableFaction,
  type LoadedCyborgs,
  type RollRecord,
  cyborgRow,
  rollRow,
} from "./state.ts";

/**
 * 만들기 규칙 = 팩 tuning을 얹은 세력·사회 계수표의 사이보그 칸(N9 합·칸 범위·성향 목록·치우침·흩어짐·다시 굴리기, N6 K 범위,
 * 시작 도시 붐빔 문턱). 굴리기는 환생과 같은 함수(@terra/sim society/cyborgStats.ts, D-444 164)다
 */
export type CyborgRules = SocietyCoefficients;

/** 팩이 없을 때(시험): sim 시험 계수표 */
export const defaultCyborgRules = (): CyborgRules => TEST_SOCIETY_COEFFICIENTS;

/** K 굴림 한 번의 눈 수(kFromRolls: 0~9999) */
const K_ROLL_SIDES = 10_000;

/** 굴림 상한 = 처음 1번 + 다시 굴리기(N9, D-445 169) */
export function rollLimit(rules: CyborgRules): number {
  return 1 + Math.max(0, rules.cyborg.initialRerolls);
}

/** 성장 K 여섯(N6 범위 균등, 숨김 D-417): 시드 하나로 굴림 여섯(0~9999) → 환생 리롤과 같은 kFromRolls */
function growthK(seed: number, rules: CyborgRules) {
  const rng = createRng(seed >>> 0);
  return kFromRolls(
    Array.from({ length: 6 }, () => rng.nextInt(K_ROLL_SIDES)),
    rules,
  );
}

/** 시작 도시 붐빔 띠(D-6041·D-445 175, 문턱은 설정값) */
export function crowdingBand(cyborgs: number, rules: CyborgRules): "quiet" | "normal" | "busy" {
  if (cyborgs >= rules.cyborg.startCrowdBusy) return "busy";
  if (cyborgs >= rules.cyborg.startCrowdNormal) return "normal";
  return "quiet";
}

/** 시작 도시 둘레에서 빈 칸을 찾는 반지름 상한(칸) */
export const PLACE_SEARCH_RADIUS = 24;

export type CyborgCommandResult =
  | { readonly ok: true; readonly roll?: CyborgRollWire }
  | { readonly ok: false; readonly code: CyborgResultCode };

export interface CreateInput {
  readonly name: string;
  readonly appearance: unknown;
  readonly factionId: number;
  readonly cityId: number;
  /** 속성 분배(D-450). 없으면 "분배 기다림"으로 만든다(4판 기기 — 5판 연결이 빠뜨리면 gateway가 먼저 막는다) */
  readonly elements?: unknown;
}

export interface CyborgService {
  status(userId: string): CyborgStatusResponse;
  creation(userId: string, nowMs: number): CyborgCreationResponse;
  nameCheck(input: string): CyborgNameCheckResponse;
  roll(userId: string, temperament: string): Promise<CyborgCommandResult>;
  create(userId: string, input: CreateInput): Promise<CyborgCommandResult>;
  /** 분배가 없는 사이보그에 속성을 한 번 나눈다(D-450) */
  allocateElements(userId: string, elements: unknown): Promise<CyborgCommandResult>;
  /** 본체 생활비(유닛 유지비)를 마지막 경계에 못 냈는가(D-453) */
  livingUnpaid(userId: string): boolean;
  /** 사이보그 자료(사이보그 화면·홈). 없으면 undefined */
  record(userId: string): CyborgRecord | undefined;
  /** 세계 유닛이 사이보그 본체인지(보유 유닛 수·정산에서 뺀다) */
  isBodyUnit(unitId: number): boolean;
  /** 사이보그 본체 유닛의 사용자(본체가 아니면 undefined, 보유 물건 효과량의 1차 스탯) */
  userOfUnit(unitId: number): string | undefined;
  /** 부팅: 유닛 행이 없는 사이보그를 시작 도시에 다시 놓는다. 다시 놓은 수 */
  repairUnits(knownUnitIds: ReadonlySet<number>): number;
  /**
   * 신앙도·신앙 포인트를 함께 올린다(신전 기도·헌금, D-444 165·D-451 — 신앙도는 100에서 멈춘다). 사이보그가 없으면 undefined.
   * 쓰기 대기열에 넣기만 한다(커밋은 부르는 쪽이 기다린다)
   */
  addFaith(
    userId: string,
    gain: number,
  ): { readonly faith: number; readonly faithPoints: number } | undefined;
  readonly size: number;
}

export interface CyborgServiceOptions {
  loaded: LoadedCyborgs;
  maps: ReadonlyMap<number, SecondMap>;
  /** 부팅 때 읽은 도시(시작 도시 표시 D-341) */
  cities: readonly CityRow[];
  settlement: Settlement;
  /** 원장(정착 지원금을 세력 국고에서 옮긴다) */
  ledger: Ledger;
  /** 세력의 국고 = 그 세력 소유 주체 ID(없으면 undefined → 지원금 0) */
  treasuryOf: (factionId: number) => number | undefined;
  writer: WorldWriter;
  nextUnitId: () => number;
  rules: () => CyborgRules;
  now: () => number;
  /** 굴림 시드(운영: crypto, 시험: 고정 수열) */
  seed: () => number;
  /** 세계가 준비됐는가(부팅 복구 중이면 busy) */
  ready: () => boolean;
  log: { warn(obj: object, message: string): void };
  /** 세력 코드 → 화면 이름(시험 국가 = 팩 국가 프리셋 이름, docs/adr/2026-11-01-npc-brain-r5.md 7절). 없으면 코드 */
  factionName?: ((code: string) => LocalizedName | undefined) | undefined;
}

/** 시작 도시 칸에서 나선(가까운 고리부터, 고리 안은 위 → 오른쪽 → 아래 → 왼쪽)으로 칸을 돈다 */
export function* spiralCells(cx: number, cy: number, radius: number): Generator<{ x: number; y: number }> {
  yield { x: cx, y: cy };
  for (let r = 1; r <= radius; r++) {
    for (let x = cx - r; x <= cx + r; x++) yield { x, y: cy - r };
    for (let y = cy - r + 1; y <= cy + r; y++) yield { x: cx + r, y };
    for (let x = cx + r - 1; x >= cx - r; x--) yield { x, y: cy + r };
    for (let y = cy + r - 1; y > cy - r; y--) yield { x: cx - r, y };
  }
}

function rollView(roll: RollRecord, rules: CyborgRules): CyborgRollWire {
  const max = rollLimit(rules);
  return {
    temperament: roll.temperament,
    stats: { ...roll.stats },
    rollsLeft: Math.max(0, max - roll.rollsUsed),
    rollsMax: max,
  };
}

const fail = (code: CyborgResultCode): CyborgCommandResult => ({ ok: false, code });

/** 생성 속성 분배 규칙(N36 설정값) */
const elementRule = (rules: CyborgRules) => ({
  cells: rules.cyborg.elementCells,
  points: rules.cyborg.elementPoints,
});

/**
 * 정착 지원금(N39): NPC 세력 = 기본액 × 세력 배율(그 세력 시작 수 − 열린 세력 가운데 가장 적은 시작 수). 유저 세력은 지도자가 정한
 * 양(지금은 가입할 유저 세력이 없어 고리만 — @terra/sim settlementGrant의 user 갈래). rules = 그 명령이 시작할 때 받은 값 한 벌
 */
const grantFor = (
  factionId: number,
  perFaction: ReadonlyMap<number, number>,
  open: readonly number[],
  rules: CyborgRules,
) => {
  const fewest = Math.min(...open.map((id) => perFaction.get(id) ?? 0));
  return settlementGrant({ kind: "npc", started: perFaction.get(factionId) ?? 0 }, fewest, rules);
};

export function createCyborgService(options: CyborgServiceOptions): CyborgService {
  const { maps, settlement, writer, log, ledger } = options;
  const byUser = new Map<string, CyborgRecord>();
  const byName = new Map<string, string>();
  const bodyUnits = new Map<number, string>();
  const rolls = new Map<string, RollRecord>();
  for (const record of options.loaded.cyborgs) {
    byUser.set(record.userId, record);
    byName.set(record.nameKey, record.userId);
    if (record.unitId !== null) bodyUnits.set(record.unitId, record.userId);
  }
  for (const roll of options.loaded.rolls) rolls.set(roll.userId, roll);
  const factions: readonly JoinableFaction[] = options.loaded.factions;

  /** 세력의 시작 도시 가운데 이 서버가 띄운 2차맵에 있는 것(id 차례) */
  const startCitiesOf = (factionId: number): CityRow[] =>
    options.cities.filter((city) => city.factionId === factionId && city.start && maps.has(city.mapKey));

  /** 도시 둘레 빈 칸에 사이보그 유닛을 세운다. 세운 유닛 ID(못 세우면 undefined) */
  const place = (city: CityRow, ownerId: number): number | undefined => {
    const map = maps.get(city.mapKey);
    if (!map) return undefined;
    const id = options.nextUnitId();
    for (const cell of spiralCells(city.cellX, city.cellY, PLACE_SEARCH_RADIUS)) {
      if (
        map.addUnit({
          id,
          size: 1,
          speed: WALK_SPEED,
          cellX: cell.x,
          cellY: cell.y,
          ownerId,
          kind: UNIT_KIND_CYBORG,
        })
      )
        return id;
    }
    return undefined;
  };

  const counts = () => {
    const perFaction = new Map<number, number>();
    const perCity = new Map<number, number>();
    for (const record of byUser.values()) {
      perFaction.set(record.factionId, (perFaction.get(record.factionId) ?? 0) + 1);
      perCity.set(record.startCityId, (perCity.get(record.startCityId) ?? 0) + 1);
    }
    return { perFaction, perCity };
  };

  const openFactionIds = (): number[] =>
    factions.filter((faction) => startCitiesOf(faction.id).length > 0).map((faction) => faction.id);

  /**
   * 지원금을 세력 국고 → 사용자 주체로 옮기고 실제로 준 양을 돌려준다(국고가 모자라면 있는 만큼, 국고가 없으면 0 — 새 화폐를 만들지
   * 않는다). 중복 방지 키 settlement_grant:<사용자>는 사이보그 행 start_grant와 같은 커밋이라, 부르는 쪽은 start_grant가 null일
   * 때만 부른다(DB 유일 키가 뒤를 받친다)
   */
  const payGrant = (
    userId: string,
    ownerId: number,
    factionId: number,
    grant: bigint,
    at: number,
  ): bigint => {
    const treasury = options.treasuryOf(factionId);
    if (treasury === undefined) return 0n;
    const available = ledger.balanceOf(treasury, ASSET_CREDIT);
    const paid = grant < available ? grant : available;
    if (paid > 0n) {
      ledger.post({
        kind: "settlement_grant",
        atMs: at,
        key: `settlement_grant:${userId}`,
        entries: [
          { account: ledger.ownerAccount(treasury, ASSET_CREDIT), amount: -paid },
          { account: ledger.ownerAccount(ownerId, ASSET_CREDIT), amount: paid },
        ],
      });
    }
    return paid;
  };

  /** 시작 재료(설정 칸 [임시]): 생산원 → 그 시작 도시의 내 도시 창고. 넣은 줄 수 */
  const giveStartGoods = (
    userId: string,
    ownerId: number,
    cityId: number,
    rules: CyborgRules,
    at: number,
  ): number => {
    const location = cityLocation(cityId);
    const entries: { account: number; amount: bigint }[] = [];
    for (const [item, qty] of [
      ["pine_log", rules.cyborg.startPineLog],
      ["stone", rules.cyborg.startStone],
    ] as const) {
      if (!Number.isSafeInteger(qty) || qty <= 0) continue;
      const asset = `item:${item}`;
      entries.push({ account: ledger.systemAccount(`source:${asset}`, asset), amount: -BigInt(qty) });
      entries.push({ account: ledger.ownerAccount(ownerId, asset, location), amount: BigInt(qty) });
    }
    if (entries.length > 0)
      ledger.post({ kind: "start_goods", atMs: at, key: `start_goods:${userId}`, entries });
    return entries.length / 2;
  };

  return {
    get size() {
      return byUser.size;
    },
    status(userId) {
      const record = byUser.get(userId);
      return record
        ? {
            cyborg: {
              name: record.name,
              appearance: record.appearance,
              elementsPending: record.elements === null,
            },
          }
        : { cyborg: null };
    },
    creation(userId, nowMs) {
      const rules = options.rules();
      const roll = rolls.get(userId);
      const { perFaction, perCity } = counts();
      const open = factions
        .map((faction) => ({ faction, cities: startCitiesOf(faction.id) }))
        .filter((entry) => entry.cities.length > 0);
      const fewest = Math.min(...open.map((entry) => perFaction.get(entry.faction.id) ?? 0));
      const list: CreationFaction[] = open.map(({ faction, cities }) => ({
        id: faction.id,
        // 세력 이름 = 팩 국가 프리셋 이름(시험 NPC 세력 포함, npc/nations.ts nationName — docs/adr/2026-11-07-play-flow.md WP1)
        name: (faction.code ? options.factionName?.(faction.code) : undefined) ?? {
          ko: faction.code ?? `#${faction.id}`,
          en: faction.code ?? `#${faction.id}`,
        },
        recommended: (perFaction.get(faction.id) ?? 0) === fewest,
        cyborgs: perFaction.get(faction.id) ?? 0,
        grant: String(
          grantFor(
            faction.id,
            perFaction,
            open.map((entry) => entry.faction.id),
            rules,
          ),
        ),
        cities: cities
          .map((city, index) => {
            const cyborgs = perCity.get(city.id) ?? 0;
            return {
              id: city.id,
              number: index + 1,
              mapKey: String(city.mapKey),
              cyborgs,
              crowding: crowdingBand(cyborgs, rules),
            };
          })
          // 기본 선택 = 가장 덜 붐비는 곳(D-6041): 붐빔 적은 차례, 같으면 앞 도시
          .toSorted((a, b) => a.cyborgs - b.cyborgs || a.number - b.number),
      }));
      const view: CyborgRollView | null = roll ? rollView(roll, rules) : null;
      const record = byUser.get(userId);
      return {
        created: record !== undefined,
        elementsPending: record !== undefined && record.elements === null,
        roll: view,
        rules: {
          statSum: rules.cyborg.initialSum,
          statMin: rules.cyborg.initialMin,
          statMax: rules.cyborg.initialMax,
          rollsMax: rollLimit(rules),
          elementCells: rules.cyborg.elementCells,
          elementPoints: rules.cyborg.elementPoints,
        },
        temperaments: rules.cyborg.temperaments.map((entry) => ({
          id: entry.id,
          favored: [...entry.favored],
        })),
        factions: list,
        generatedAt: nowMs,
      };
    },
    nameCheck(input) {
      const parsed = parseCyborgName(input);
      if (!parsed.ok) return { ok: false, code: parsed.problem };
      if (byName.has(parsed.key)) return { ok: false, code: "taken" };
      return { ok: true, display: parsed.display };
    },
    async roll(userId, temperament) {
      if (!options.ready()) return fail("busy");
      if (byUser.has(userId)) return fail("already_created");
      const rules = options.rules();
      if (!temperamentOf(temperament, rules)) return fail("unknown_temperament");
      const previous = rolls.get(userId);
      const used = previous?.rollsUsed ?? 0;
      const limit = rollLimit(rules);
      if (used >= limit) return fail("rolls_exhausted");
      const seed = options.seed() >>> 0;
      const rng = createRng(seed);
      // 환생과 같은 굴리기(처음 굴림 → 다시 굴리기, 남은 다시 굴리기 = 상한 − 쓴 굴림)
      const next = previous
        ? rerollStats(
            { temperament: previous.temperament, spread: previous.stats, rerollsLeft: limit - used },
            temperament,
            rng,
            rules,
          )
        : firstStatRoll(temperament, rng, rules);
      if (!next) return fail("rolls_exhausted");
      const record: RollRecord = {
        userId,
        temperament,
        stats: next.spread,
        rollsUsed: used + 1,
        seed,
        updatedAtMs: options.now(),
      };
      rolls.set(userId, record);
      writer.upsert("cyborgRolls", rollRow(record));
      await writer.durable();
      return { ok: true, roll: rollView(record, rules) };
    },
    async create(userId, input) {
      if (!options.ready()) return fail("busy");
      if (byUser.has(userId)) return fail("already_created");
      const roll = rolls.get(userId);
      if (!roll) return fail("roll_required");
      const parsed = parseCyborgName(input.name);
      if (!parsed.ok) return fail(parsed.problem === "reserved" ? "name_reserved" : "name_invalid");
      if (byName.has(parsed.key)) return fail("name_taken");
      const appearance = input.appearance;
      if (!isCyborgAppearance(appearance)) return fail("appearance_invalid");
      const faction = factions.find((entry) => entry.id === input.factionId);
      const cities = faction ? startCitiesOf(faction.id) : [];
      if (!faction || cities.length === 0) return fail("unknown_faction");
      const city = cities.find((entry) => entry.id === input.cityId);
      if (!city) return fail("unknown_city");
      // 이 명령은 시작할 때 받은 설정 칸 값 한 벌만 쓴다(분배 검사·지원금·성장 K). 커밋 전까지 기다림이 없어 시작 = 커밋 때 값
      const rules = options.rules();
      let elements: CyborgRecord["elements"] = null;
      if (input.elements !== undefined) {
        const checked = checkElementAllocation(input.elements, elementRule(rules));
        if (!checked.ok) return fail("elements_invalid");
        elements = checked.values;
      }
      const at = options.now();
      // 지원금은 이 사이보그를 세기 전의 시작 수로 정한다(화면에 보인 양과 같다)
      const grant = grantFor(faction.id, counts().perFaction, openFactionIds(), rules);
      // 여기부터 한 번의 동기 처리: 소유 주체 → 유닛 → 지원금 → 사이보그·가입·굴림 지우기(같은 커밋)
      const owner = settlement.ownerOfUser(userId, at);
      const unitId = place(city, owner.id);
      if (unitId === undefined) return fail("no_room");
      const paid = payGrant(userId, owner.id, faction.id, grant, at);
      giveStartGoods(userId, owner.id, city.id, rules, at);
      const record: CyborgRecord = {
        userId,
        name: parsed.display,
        nameKey: parsed.key,
        temperament: roll.temperament,
        initial: roll.stats,
        kPm: growthK(options.seed(), rules),
        appearance,
        factionId: faction.id,
        startCityId: city.id,
        unitId,
        level: 1,
        exp: 0,
        rebirths: 0,
        faith: 0,
        createdAtMs: at,
        elements,
        religion: null,
        faithPoints: 0,
        startGrant: paid,
      };
      byUser.set(userId, record);
      byName.set(record.nameKey, userId);
      bodyUnits.set(unitId, userId);
      rolls.delete(userId);
      writer.upsert("factionMembers", { user_id: userId, faction_id: faction.id });
      writer.upsert("cyborgs", cyborgRow(record));
      writer.remove("cyborgRolls", { user_id: userId });
      await writer.durable();
      return { ok: true };
    },
    async allocateElements(userId, elements) {
      if (!options.ready()) return fail("busy");
      const record = byUser.get(userId);
      if (!record) return fail("no_cyborg");
      if (record.elements !== null) return fail("elements_locked");
      // 이 명령은 시작할 때 받은 설정 칸 값 한 벌만 쓴다(분배 검사·지원금, docs/adr/2026-11-01-dev-settings-panel.md 7절)
      const rules = options.rules();
      const checked = checkElementAllocation(elements, elementRule(rules));
      if (!checked.ok) return fail("elements_invalid");
      record.elements = checked.values;
      // 지원금 전에 만든 사이보그는 이때 한 번 받는다(D-456): 지금 세력의 국고에서, 자기를 뺀 시작 수로 정한 양(만들 때와 같은 규칙)
      if (record.startGrant === null) {
        const at = options.now();
        const perFaction = new Map(counts().perFaction);
        perFaction.set(record.factionId, Math.max(0, (perFaction.get(record.factionId) ?? 0) - 1));
        const grant = grantFor(record.factionId, perFaction, openFactionIds(), rules);
        const owner = settlement.ownerOfUser(userId, at);
        record.startGrant = payGrant(userId, owner.id, record.factionId, grant, at);
      }
      writer.upsert("cyborgs", cyborgRow(record));
      await writer.durable();
      return { ok: true };
    },
    livingUnpaid: (userId) => settlement.upkeepUnpaid(userId),
    record: (userId) => byUser.get(userId),
    isBodyUnit: (unitId) => bodyUnits.has(unitId),
    userOfUnit: (unitId) => bodyUnits.get(unitId),
    addFaith(userId, gain) {
      const record = byUser.get(userId);
      if (!record) return undefined;
      const next = addDevotion(record.faith, record.faithPoints, gain);
      record.faith = next.faith;
      record.faithPoints = next.faithPoints;
      writer.upsert("cyborgs", cyborgRow(record));
      return next;
    },
    repairUnits(knownUnitIds) {
      let repaired = 0;
      for (const record of byUser.values()) {
        if (record.unitId !== null && knownUnitIds.has(record.unitId)) continue;
        const city = options.cities.find((entry) => entry.id === record.startCityId);
        if (!city || !maps.has(city.mapKey)) {
          log.warn(
            { userId: record.userId, cityId: record.startCityId },
            "cyborg has no unit and its start city map is not loaded",
          );
          continue;
        }
        const owner = settlement.ownerOfUser(record.userId, options.now());
        const unitId = place(city, owner.id);
        if (unitId === undefined) {
          log.warn({ userId: record.userId, cityId: city.id }, "no room to place a cyborg again");
          continue;
        }
        if (record.unitId !== null) bodyUnits.delete(record.unitId);
        record.unitId = unitId;
        bodyUnits.set(unitId, record.userId);
        writer.upsert("cyborgs", cyborgRow(record));
        repaired += 1;
      }
      return repaired;
    },
  };
}

/** tRPC 조회 모양(로그인한 본인)으로 감싼다 */
export function cyborgReadsOf(service: CyborgService): CyborgReadServices {
  return {
    status: (viewer) => service.status(viewer.id),
    creation: (viewer, nowMs) => service.creation(viewer.id, nowMs),
    nameCheck: (name) => service.nameCheck(name),
  };
}
