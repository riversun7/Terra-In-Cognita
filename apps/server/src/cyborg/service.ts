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
//   국고가 모자라면 국고에 있는 만큼만 준다. 국고 주체의 돈(그 나라 화폐, world/money.ts)으로 낸다.
//   지원금 전에 만든 사이보그(start_grant null)는 다음 접속의 한 번 속성 분배 때 같은 키로 한 번 받는다(D-456).
// - 시작 재료(docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산", 질문 520): 같은 동기 처리에서 첫 건물 재료(설정 칸 [임시] 소나무 원목·석재
//   개수)를 그 시작 도시의 내 도시 창고(원장 위치 = 도시 ID)에 넣는다. 생산원 source:item:<ID>에서 나온다(시뮬 시작 물자·개발 재료와 같은
//   계정). 원장 거래 start_goods, 중복 방지 키 start_goods:<사용자>. 지원금 전에 만든 사이보그에는 주지 않는다.
// 쓰는 프로세스는 하나다(ADR 3): 메모리 표가 원본의 캐시이고, 같은 스레드라 두 요청이 같은 값을 보지 않는다.
import type {
  CreationFaction,
  CreationNationProfile,
  CyborgCreationResponse,
  CyborgNameCheckResponse,
  CyborgRollView,
  CyborgStatusResponse,
} from "@terra/shared/cyborg";
import { characterLookFromLegacy, characterSeedOf, isCharacterLook } from "@terra/shared/characterLook";
import { checkElementAllocation, isCyborgAppearance, parseCyborgName } from "@terra/shared/cyborg";
import { cityLocation } from "@terra/shared/goodsPlaces";
import { RELATION_SCORE_MAX, RELATION_SCORE_MIN } from "@terra/shared/faction";
import type { LocalizedName } from "@terra/shared/roster";
import type { CyborgResultCode, CyborgRollWire } from "@terra/protocol";
import { createRng, hasStaffRole } from "@terra/shared";
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
import { moneyOf } from "../world/money.ts";
import type { Settlement } from "../world/settlement.ts";
import { UNIT_KIND_CYBORG } from "../world/unitKinds.ts";
import {
  type CyborgRecord,
  type JoinableFaction,
  type LoadedCyborgs,
  type RollRecord,
  cyborgLookOf,
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

/** 굴림 상한 = 처음 1번 + 다시 굴리기(N9, D-445 169 — 팩 값 5는 사용자 요청 2026-11-11) */
export function rollLimit(rules: CyborgRules): number {
  return 1 + Math.max(0, rules.cyborg.initialRerolls);
}

/**
 * 추천 나라(docs/adr/2026-11-01-first-login-cyborg.md "바뀜 (2026-11-11)"): 시작 도시 하나당 시작한 사이보그 수가 적은 차례 → 시작 도시가
 * 많은 차례 → 세력 ID 차례로 앞의 RECOMMENDED_NATIONS곳(열린 나라가 그 수 이하면 1곳 — 모두 추천이면 뜻이 없다). 빈 세계에서는 시작 도시가
 * 많은 나라가 된다
 */
export const RECOMMENDED_NATIONS = 3;

export function recommendedNations(
  open: readonly { readonly id: number; readonly cyborgs: number; readonly startCities: number }[],
): ReadonlySet<number> {
  const count = open.length > RECOMMENDED_NATIONS ? RECOMMENDED_NATIONS : Math.min(1, open.length);
  const order = open
    .filter((entry) => entry.startCities > 0)
    // 사이보그 ÷ 시작 도시를 나눗셈 없이 견준다(a/b < c/d ⇔ a·d < c·b, 둘 다 양수)
    .toSorted(
      (a, b) =>
        a.cyborgs * b.startCities - b.cyborgs * a.startCities || b.startCities - a.startCities || a.id - b.id,
    );
  return new Set(order.slice(0, count).map((entry) => entry.id));
}

/** 만들기 화면 자료를 부르는 사람에 따라 달라지는 것(tRPC cyborg.creation — cyborgReadsOf가 채운다) */
export interface CreationView {
  /** 운영진: 다시 굴리기 횟수 제한 없음(2026-11-11) */
  readonly unlimitedRolls?: boolean | undefined;
  /** 이 세계에 올린 국가 마크 그림(프리셋 ID → 해시). 못 읽었으면 없음(만든 마크만 보인다) */
  readonly emblemUploads?: ReadonlyMap<string, string> | undefined;
}

/** 굴리기 명령의 부르는 사람 몫 */
export interface RollOptions {
  /** 운영진: 횟수 제한 없음(서버가 판정, 2026-11-11) */
  readonly unlimited?: boolean | undefined;
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
  /** 옛 2D 외형(35판 기기만 — 36판부터 선택 칸, D-560 1421). look이 없을 때만 그 값에서 3D 외형을 넘긴다. 저장하지 않는다 */
  readonly appearance?: unknown;
  readonly factionId: number;
  readonly cityId: number;
  /** 속성 분배(D-450). 없으면 "분배 기다림"으로 만든다(4판 기기 — 5판 연결이 빠뜨리면 gateway가 먼저 막는다) */
  readonly elements?: unknown;
  /** 3D 외형(docs/adr/2026-11-11-character-3d.md 5절). 36판 기기는 늘 보낸다. 없으면 옛 외형에서 넘기고 한 번 무료로 고를 수 있다 */
  readonly look?: unknown;
}

export interface CyborgService {
  status(userId: string): CyborgStatusResponse;
  creation(userId: string, nowMs: number, view?: CreationView): CyborgCreationResponse;
  nameCheck(input: string): CyborgNameCheckResponse;
  roll(userId: string, temperament: string, options?: RollOptions): Promise<CyborgCommandResult>;
  create(userId: string, input: CreateInput): Promise<CyborgCommandResult>;
  /** 분배가 없는 사이보그에 속성을 한 번 나눈다(D-450) */
  allocateElements(userId: string, elements: unknown): Promise<CyborgCommandResult>;
  /**
   * 3D 외형을 고르기 전에 만든 사이보그(서버가 옛 2D에서 넘겨 채운 외형 — lookAuto)가 3D 외형을 한 번 고른다(질문 961 나,
   * docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-11, 961·963)"). 이미 골랐으면 look_locked
   */
  chooseLook(userId: string, look: unknown): Promise<CyborgCommandResult>;
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
  /** 첫 접속에서 고를 수 있는 나라인가(고정 NPC 국가 + 이 서버에 시작 도시) — 국적 바꾸기의 받는 나라도 같은 목록이다 */
  joinable(factionId: number): boolean;
  /**
   * 국적을 바꾼다(docs/adr/2026-11-08-citizenship.md·"바뀜 (D-526)"): 나라·내 도시·바꾼 시각·옛 나라 우호도를 메모리에 고치고 사이보그 행·세력
   * 가입·우호도·기록 한 줄을 쓰기 대기열에 넣는다(커밋은 부르는 쪽이 원장 거래와 함께 기다린다). 판정(쉬는 날·값·자리)은 부르는 쪽
   * (citizenship/service.ts)이 먼저 한다
   */
  changeNation(userId: string, change: NationChange): boolean;
  /**
   * 가문원의 나라·내 도시를 가문 소속 도시에 맞춘다(기획 D-569 "나라는 하나" — 시민권 = 가문 소속 도시의 나라, world/houseTies.ts가 가문 명령 뒤·
   * 1분마다 부른다). 값·우호도·쉬는 날·기록 줄은 없다(귀화가 아니다). 도시를 모르면(null) 나라만. 바뀌었으면 true(쓰기 대기열에 넣기만 한다)
   */
  alignHome(userId: string, home: { readonly factionId: number; readonly cityId: number | null }): boolean;
  /**
   * 국적 바꾸기 설정 칸(실효 값, 부를 때마다). fee = 받는 나라(nation)의 귀화 조건(D-526 부호 있는 최소 단위: + 입회비 / − 지원금 — 나라가 정한
   * 값, 없으면 설정 칸 기본값), restMs = 쉬는 기간, standingDrop·standingDropHostile = 옛 나라 우호도 하락(보통·적대 세력으로)
   */
  naturalizationRules(nation?: number): NaturalizationRules;
  /** 그 사람과 그 나라 사이 우호도(D-526, −100~100, 없으면 0) */
  standingOf(userId: string, factionId: number): number;
  /** 그 사람의 그 나라 명성(D-326, 없으면 0) */
  renownOf(userId: string, factionId: number): number;
  /** 그 사람의 그 나라 명성을 더한다(쓰기 대기열, 동기 — 부르는 쪽 커밋에 든다). 사이보그가 없으면 undefined, 있으면 새 값 */
  addRenown(userId: string, factionId: number, amount: number, atMs: number): number | undefined;
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

/** 국적 바꾸기 설정 칸(실효 값) */
export interface NaturalizationRules {
  readonly fee: bigint;
  readonly restMs: number;
  readonly standingDrop: number;
  readonly standingDropHostile: number;
}

/** 국적 바꾸기 한 번(판정을 마친 값) */
export interface NationChange {
  readonly factionId: number;
  readonly cityId: number;
  readonly buildingId: number;
  readonly atMs: number;
  /** 낸 입회비·받은 지원금(최소 단위, 둘 중 하나만 0보다 크다) */
  readonly fee: bigint;
  readonly grant: bigint;
  /** 옛 나라 우호도가 떨어지는 양(0 이상)과 적대 세력으로 옮겼나 */
  readonly standingDrop: number;
  readonly hostile: boolean;
}

/** 우호도 하락 설정 칸 → 0 이상·눈금 폭(200) 이하 */
const standingDropCell = (value: number): number =>
  Number.isSafeInteger(value) && value > 0 ? Math.min(value, RELATION_SCORE_MAX - RELATION_SCORE_MIN) : 0;

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
  /**
   * 나라 고르기 카드의 자세한 정보(2026-11-11, nationProfile.ts). 만들기 화면 자료 한 번마다 한 번 불러 세력 코드 → 정보 함수를 받는다(휴먼 수를
   * 한 번만 센다). 없으면 정보 없이 이름·도시만
   */
  nationProfiles?:
    | ((
        emblemUploads: ReadonlyMap<string, string> | undefined,
      ) => (code: string) => CreationNationProfile | undefined)
    | undefined;
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

/** 굴림 → 화면 값. 횟수 제한이 없는 운영진은 늘 "남은 = 상한"(화면은 rules.rollsUnlimited로 "제한 없음"을 보인다 — 프로토콜은 그대로) */
function rollView(roll: RollRecord, rules: CyborgRules, unlimited = false): CyborgRollWire {
  const max = rollLimit(rules);
  return {
    temperament: roll.temperament,
    stats: { ...roll.stats },
    rollsLeft: unlimited ? max : Math.max(0, max - roll.rollsUsed),
    rollsMax: max,
  };
}

const fail = (code: CyborgResultCode): CyborgCommandResult => ({ ok: false, code });

/** 나라 정보 칸(있을 때만 — exactOptionalPropertyTypes) */
const profileField = (profile: CreationNationProfile | undefined): { profile?: CreationNationProfile } =>
  profile ? { profile } : {};

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
  // 옛 2D 외형 정리(D-560 1421): 3D 외형을 채웠거나 옛 칸이 남은 줄을 켤 때 한 번 다시 쓴다(appearance = null). 다음에 켜면 할 일이 없다
  for (const userId of options.loaded.legacyLooks) {
    const record = byUser.get(userId);
    if (record) writer.upsert("cyborgs", cyborgRow(record));
  }
  if (options.loaded.legacyLooks.length > 0)
    log.warn({ count: options.loaded.legacyLooks.length }, "cyborg legacy 2D looks migrated to 3D");

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
    const asset = moneyOf(ledger, treasury); // 내는 쪽(국고)의 돈
    const available = ledger.balanceOf(treasury, asset);
    const paid = grant < available ? grant : available;
    if (paid > 0n) {
      ledger.post({
        kind: "settlement_grant",
        atMs: at,
        key: `settlement_grant:${userId}`,
        entries: [
          { account: ledger.ownerAccount(treasury, asset), amount: -paid },
          { account: ledger.ownerAccount(ownerId, asset), amount: paid },
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
              look: cyborgLookOf(record),
              elementsPending: record.elements === null,
            },
          }
        : { cyborg: null };
    },
    creation(userId, nowMs, view = {}) {
      const rules = options.rules();
      const roll = rolls.get(userId);
      const unlimited = view.unlimitedRolls === true;
      const { perFaction, perCity } = counts();
      const open = factions
        .map((faction) => ({ faction, cities: startCitiesOf(faction.id) }))
        .filter((entry) => entry.cities.length > 0);
      const recommended = recommendedNations(
        open.map((entry) => ({
          id: entry.faction.id,
          cyborgs: perFaction.get(entry.faction.id) ?? 0,
          startCities: entry.cities.length,
        })),
      );
      const profileOf = options.nationProfiles?.(view.emblemUploads);
      const list: CreationFaction[] = open.map(({ faction, cities }) => ({
        id: faction.id,
        // 세력 이름 = 팩 국가 프리셋 이름(시험 NPC 세력 포함, npc/nations.ts nationName — docs/adr/2026-11-07-play-flow.md WP1)
        name: (faction.code ? options.factionName?.(faction.code) : undefined) ?? {
          ko: faction.code ?? `#${faction.id}`,
          en: faction.code ?? `#${faction.id}`,
        },
        recommended: recommended.has(faction.id),
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
              name: city.name ?? null,
              mapKey: String(city.mapKey),
              cyborgs,
              crowding: crowdingBand(cyborgs, rules),
            };
          })
          // 기본 선택 = 가장 덜 붐비는 곳(D-6041): 붐빔 적은 차례, 같으면 앞 도시
          .toSorted((a, b) => a.cyborgs - b.cyborgs || a.number - b.number),
        ...profileField(faction.code === null ? undefined : profileOf?.(faction.code)),
      }));
      const rollNow: CyborgRollView | null = roll ? rollView(roll, rules, unlimited) : null;
      const record = byUser.get(userId);
      return {
        created: record !== undefined,
        elementsPending: record !== undefined && record.elements === null,
        roll: rollNow,
        rules: {
          statSum: rules.cyborg.initialSum,
          statMin: rules.cyborg.initialMin,
          statMax: rules.cyborg.initialMax,
          rollsMax: rollLimit(rules),
          rollsUnlimited: unlimited,
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
    async roll(userId, temperament, rollOptions = {}) {
      if (!options.ready()) return fail("busy");
      if (byUser.has(userId)) return fail("already_created");
      const rules = options.rules();
      if (!temperamentOf(temperament, rules)) return fail("unknown_temperament");
      const previous = rolls.get(userId);
      const used = previous?.rollsUsed ?? 0;
      // 운영진은 횟수 제한이 없다(2026-11-11). 쓴 굴림은 그대로 센다(역할을 잃으면 그때부터 상한이 걸린다)
      const unlimited = rollOptions.unlimited === true;
      const limit = rollLimit(rules);
      if (!unlimited && used >= limit) return fail("rolls_exhausted");
      const seed = options.seed() >>> 0;
      const rng = createRng(seed);
      // 환생과 같은 굴리기(처음 굴림 → 다시 굴리기, 남은 다시 굴리기 = 상한 − 쓴 굴림)
      const next = previous
        ? rerollStats(
            {
              temperament: previous.temperament,
              spread: previous.stats,
              rerollsLeft: unlimited ? Math.max(1, limit - used) : limit - used,
            },
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
      return { ok: true, roll: rollView(record, rules, unlimited) };
    },
    async create(userId, input) {
      if (!options.ready()) return fail("busy");
      if (byUser.has(userId)) return fail("already_created");
      const roll = rolls.get(userId);
      if (!roll) return fail("roll_required");
      const parsed = parseCyborgName(input.name);
      if (!parsed.ok) return fail(parsed.problem === "reserved" ? "name_reserved" : "name_invalid");
      if (byName.has(parsed.key)) return fail("name_taken");
      // 3D 외형: 맞지 않으면 만들지 않는다. 없으면(35판 기기) 옛 2D 칸에서 넘기고 한 번 무료로 고를 수 있게 둔다. 옛 2D 칸은 저장하지 않는다
      // (D-560 1421)
      let look: CyborgRecord["look"];
      let lookAuto = false;
      if (input.look !== undefined) {
        if (!isCharacterLook(input.look)) return fail("appearance_invalid");
        look = input.look;
      } else {
        if (!isCyborgAppearance(input.appearance)) return fail("appearance_invalid");
        look = characterLookFromLegacy(input.appearance, characterSeedOf(userId));
        lookAuto = true;
      }
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
        look,
        lookAuto,
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
        nationChangedAtMs: null,
        standings: new Map<number, number>(),
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
    async chooseLook(userId, look) {
      if (!options.ready()) return fail("busy");
      const record = byUser.get(userId);
      if (!record) return fail("no_cyborg");
      // 한 번만: 고른 3D 외형이 있으면(만들 때 골랐거나 이미 한 번 썼다) 바꾸지 않는다(다시 고르기는 환생 D-352·계정 서비스 D-7032)
      if (!record.lookAuto) return fail("look_locked");
      if (!isCharacterLook(look)) return fail("appearance_invalid");
      record.look = look;
      record.lookAuto = false;
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
    naturalizationRules(nation) {
      const c = options.rules().cyborg;
      // 나라가 정한 값이 먼저, 없으면 설정 칸 기본값(NPC 국가는 늘 기본값 — D-526)
      const own =
        nation === undefined ? null : (factions.find((entry) => entry.id === nation)?.naturalizeFee ?? null);
      return {
        fee: own ?? (Number.isSafeInteger(c.naturalizeFee) ? BigInt(c.naturalizeFee) : 0n),
        restMs: Number.isSafeInteger(c.naturalizeRestMs) && c.naturalizeRestMs > 0 ? c.naturalizeRestMs : 0,
        standingDrop: standingDropCell(c.naturalizeStandingDrop),
        standingDropHostile: standingDropCell(c.naturalizeStandingDropHostile),
      };
    },
    standingOf: (userId, factionId) => byUser.get(userId)?.standings.get(factionId) ?? 0,
    renownOf: (userId, factionId) => byUser.get(userId)?.renown?.get(factionId) ?? 0,
    addRenown(userId, factionId, amount, atMs) {
      const record = byUser.get(userId);
      if (!record) return undefined;
      const map = record.renown ?? new Map<number, number>();
      record.renown = map;
      const renown = Math.max(0, (map.get(factionId) ?? 0) + Math.trunc(amount));
      map.set(factionId, renown);
      writer.upsert("userNationRenown", {
        user_id: userId,
        faction_id: factionId,
        renown,
        updated_at_ms: atMs,
      });
      return renown;
    },
    joinable: (factionId) =>
      factions.some((faction) => faction.id === factionId) && startCitiesOf(factionId).length > 0,
    changeNation(userId, change) {
      const record = byUser.get(userId);
      if (!record || record.factionId === change.factionId) return false;
      const from = record.factionId;
      record.factionId = change.factionId;
      record.startCityId = change.cityId;
      record.nationChangedAtMs = change.atMs;
      // 옛 나라 우호도(D-526): 떨어진 값을 눈금 안으로 자르고 덮어쓴다
      const score = Math.max(
        RELATION_SCORE_MIN,
        (record.standings.get(from) ?? 0) - Math.max(0, change.standingDrop),
      );
      record.standings.set(from, score);
      writer.upsert("factionMembers", { user_id: userId, faction_id: change.factionId });
      writer.upsert("cyborgs", cyborgRow(record));
      writer.upsert("userNationStandings", {
        user_id: userId,
        faction_id: from,
        score,
        updated_at_ms: change.atMs,
      });
      writer.append("nationalityChanges", {
        user_id: userId,
        from_faction: from,
        to_faction: change.factionId,
        city_id: change.cityId,
        building_id: change.buildingId,
        at_ms: change.atMs,
        fee: change.fee,
        grant_returned: 0n,
        grant_paid: change.grant,
        standing_drop: Math.max(0, change.standingDrop),
        hostile: change.hostile,
      });
      return true;
    },
    alignHome(userId, home) {
      const record = byUser.get(userId);
      if (!record) return false;
      const city = home.cityId ?? record.startCityId;
      if (record.factionId === home.factionId && record.startCityId === city) return false;
      if (record.factionId !== home.factionId)
        writer.upsert("factionMembers", { user_id: userId, faction_id: home.factionId });
      record.factionId = home.factionId;
      record.startCityId = city;
      writer.upsert("cyborgs", cyborgRow(record));
      return true;
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

/**
 * tRPC 조회 모양(로그인한 본인)으로 감싼다. 운영진은 다시 굴리기 제한 없음(hasStaffRole). emblemUploads = 이 세계에 올린 국가 마크 해시(읽지
 * 못하면 만든 마크만)
 */
export function cyborgReadsOf(
  service: CyborgService,
  extras: { readonly emblemUploads?: (() => Promise<ReadonlyMap<string, string>>) | undefined } = {},
): CyborgReadServices {
  return {
    status: (viewer) => service.status(viewer.id),
    creation: async (viewer, nowMs) => {
      const emblemUploads = extras.emblemUploads
        ? await extras.emblemUploads().catch(() => undefined)
        : undefined;
      return service.creation(viewer.id, nowMs, {
        unlimitedRolls: hasStaffRole(viewer.roles),
        emblemUploads,
      });
    },
    nameCheck: (name) => service.nameCheck(name),
  };
}
