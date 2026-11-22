// 유닛·사이보그 화면 문구와 자료 다듬기 — 순수 함수(시험 대상, rosterText.test.ts).
// - 키로 고르는 문구는 정적 표에 둔다(m[키]는 oxlint가 막는다). 종류가 늘면 satisfies가 빠진 값을 알려 준다.
// - 팩 이름({ko, en})은 지금 언어로 고른다. 모르는 ID는 ID를 그대로 보인다(더 새 서버·팩).
// - 상태 분류·정렬·걸러 보기는 화면이 정한다(서버는 자료만 준다). 기본 정렬은 손이 필요한 순(질문 137 기본안 → D-443).
import type {
  EquipSlot,
  LocalizedName,
  PartyRole,
  RosterAuctionLot,
  RosterJob,
  RosterNames,
  RosterStat,
  RosterUnit,
  UnitType,
} from "@terra/shared/roster";
import { m } from "../paraglide/messages.js";
import { type Locale, getLocale } from "../paraglide/runtime.js";

type Text = (locale: Locale) => string;

const TYPE_LABELS = {
  cyborg: (locale) => m.roster_type_cyborg({}, { locale }),
  human: (locale) => m.roster_type_human({}, { locale }),
  creature: (locale) => m.roster_type_creature({}, { locale }),
  android: (locale) => m.roster_type_android({}, { locale }),
  test_unit: (locale) => m.roster_type_test_unit({}, { locale }),
} satisfies Record<UnitType, Text>;

const SLOT_LABELS = {
  weapon: (locale) => m.roster_slot_weapon({}, { locale }),
  offhand: (locale) => m.roster_slot_offhand({}, { locale }),
  head: (locale) => m.roster_slot_head({}, { locale }),
  body: (locale) => m.roster_slot_body({}, { locale }),
  accessory: (locale) => m.roster_slot_accessory({}, { locale }),
  organ: (locale) => m.roster_slot_organ({}, { locale }),
  part: (locale) => m.roster_slot_part({}, { locale }),
  saddle: (locale) => m.roster_slot_saddle({}, { locale }),
} satisfies Record<EquipSlot, Text>;

const ROLE_LABELS = {
  tank: (locale) => m.units_role_tank({}, { locale }),
  dealer: (locale) => m.units_role_dealer({}, { locale }),
  support: (locale) => m.units_role_support({}, { locale }),
  control: (locale) => m.units_role_control({}, { locale }),
} satisfies Record<PartyRole, Text>;

const HOUSE_LABELS = {
  human: (locale) => m.units_house_human({}, { locale }),
  creature: (locale) => m.units_house_creature({}, { locale }),
  android: (locale) => m.units_house_android({}, { locale }),
  part: (locale) => m.units_house_part({}, { locale }),
  vehicle: (locale) => m.units_house_vehicle({}, { locale }),
} satisfies Record<RosterAuctionLot["house"], Text>;

const PRIMARY_LABELS = {
  str: (locale) => m.roster_stat_str({}, { locale }),
  dex: (locale) => m.roster_stat_dex({}, { locale }),
  agi: (locale) => m.roster_stat_agi({}, { locale }),
  vit: (locale) => m.roster_stat_vit({}, { locale }),
  int: (locale) => m.roster_stat_int({}, { locale }),
  wis: (locale) => m.roster_stat_wis({}, { locale }),
} satisfies Record<string, Text>;

/** 스탯 약자(STR·VIT…). 두 언어 같은 글자지만 화면 문구라 메시지 키로 둔다 */
const PRIMARY_CODES = {
  str: (locale) => m.roster_stat_str_code({}, { locale }),
  dex: (locale) => m.roster_stat_dex_code({}, { locale }),
  agi: (locale) => m.roster_stat_agi_code({}, { locale }),
  vit: (locale) => m.roster_stat_vit_code({}, { locale }),
  int: (locale) => m.roster_stat_int_code({}, { locale }),
  wis: (locale) => m.roster_stat_wis_code({}, { locale }),
} satisfies Record<keyof typeof PRIMARY_LABELS, Text>;

/** [임시] 시험 자산(서버 world/settlement.ts 시험 자산 코드). 실제 자산이 팩에 들어오면 팩 이름 */
const TEST_ASSETS: Readonly<Record<string, Text>> = {
  s3_test_ore: (locale) => m.roster_asset_test_ore({}, { locale }),
  s3_test_credit: (locale) => m.roster_asset_test_credit({}, { locale }),
};

export const typeLabel = (type: UnitType, locale: Locale = getLocale()): string => TYPE_LABELS[type](locale);
export const slotLabel = (slot: EquipSlot, locale: Locale = getLocale()): string => SLOT_LABELS[slot](locale);
export const roleLabel = (role: PartyRole, locale: Locale = getLocale()): string => ROLE_LABELS[role](locale);
export const houseLabel = (house: RosterAuctionLot["house"], locale: Locale = getLocale()): string =>
  HOUSE_LABELS[house](locale);
export const primaryLabel = (stat: keyof typeof PRIMARY_LABELS, locale: Locale = getLocale()): string =>
  PRIMARY_LABELS[stat](locale);
export const primaryCode = (stat: keyof typeof PRIMARY_CODES, locale: Locale = getLocale()): string =>
  PRIMARY_CODES[stat](locale);

/** 팩 이름을 지금 언어로. 없으면 ID */
export function localName(name: LocalizedName | undefined, id: string, locale: Locale = getLocale()): string {
  if (!name) return id;
  return locale === "en" ? name.en : name.ko;
}

/** 세계 유닛 번호("w42" → "42"). 시안 ID는 그대로 */
export function unitNumber(id: string): string {
  return id.startsWith("w") ? id.slice(1) : id;
}

/**
 * 유닛 이름: 지은 이름, 없으면 "종류 #번호"(예: "휴먼 #42"). 수호신 상태인 휴먼은 "수호신 #번호"(종류가 아니라 상태 — 사용자 결정 2026-11-22,
 * 기획 D-589·D-5059)
 */
export function unitLabel(
  unit: Pick<RosterUnit, "id" | "name" | "type" | "guardian">,
  locale: Locale = getLocale(),
): string {
  if (unit.name !== null) return unit.name;
  const type = unit.guardian === true ? m.unit_guardian_label({}, { locale }) : typeLabel(unit.type, locale);
  return m.roster_unnamed({ type, number: unitNumber(unit.id) }, { locale });
}

/** 직무 이름(시설 = 팩 이름, 시험 직무 = 메시지) */
export function jobLabel(job: RosterJob, names: RosterNames, locale: Locale = getLocale()): string {
  switch (job.kind) {
    case "facility":
      return localName(names.facilities[job.facility], job.facility, locale);
    case "test_gather":
      return m.roster_job_test_gather({}, { locale });
    case "test_hunt":
      return m.roster_job_test_hunt({}, { locale });
    default: {
      const unknown: never = job;
      return String(unknown);
    }
  }
}

/** 화물·인벤토리 자산 이름: 팩 아이템 → 시험 자산 → 코드 */
export function assetLabel(asset: string, names: RosterNames, locale: Locale = getLocale()): string {
  const item = names.items[asset];
  if (item) return localName(item, asset, locale);
  const test = TEST_ASSETS[asset];
  return test ? test(locale) : asset;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 남은 시간을 내림해서 "3시간 후"처럼(늘려 말하지 않는다, 처리함 formatDue와 같은 규칙). 지났으면 null */
export function remaining(untilMs: number, now: number, locale: Locale = getLocale()): string | null {
  const left = untilMs - now;
  if (left <= 0) return null;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  if (left < MINUTE) return m.roster_soon({}, { locale });
  if (left < HOUR) return format.format(Math.floor(left / MINUTE), "minute");
  if (left < 2 * DAY) return format.format(Math.floor(left / HOUR), "hour");
  return format.format(Math.floor(left / DAY), "day");
}

/**
 * 기간을 "N시간 M분"으로(기획 D-525 "자연회복은 시간,분 단위로 표시"). 날로 묶지 않는다(3일 = "72시간 0분"). 분은 올림이다 — 남은 회복 시간을
 * 줄여 말하지 않고 0분이 보이지 않게(30초 남음 = "1분"). 1시간이 안 되면 "M분". 0 이하면 "0분"
 */
export function formatHoursMinutes(ms: number, locale: Locale = getLocale()): string {
  const total = ms <= 0 ? 0 : Math.ceil(ms / MINUTE);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours <= 0) return m.injury_time_m({ minutes: formatNumber(minutes, locale) }, { locale });
  return m.injury_time_hm(
    { hours: formatNumber(hours, locale), minutes: formatNumber(minutes, locale) },
    { locale },
  );
}

/** 남은 회복 시간 "N시간 M분"(D-525). 지났으면 null */
export function recoveryLeft(untilMs: number, now: number, locale: Locale = getLocale()): string | null {
  return untilMs <= now ? null : formatHoursMinutes(untilMs - now, locale);
}

/** [임시] ‰로 저장하는 양 모양 행(크리 배율 1300 = ×1.30). 표에 행이 생기면 서버가 단위를 보내게 바꾼다 */
const PERMILLE_QUANTITIES: ReadonlySet<string> = new Set(["crit_multiplier"]);
/** [임시] 분당 값인 양 모양 행(스태미나·MP 회복, 쉴드 재생 D-458: 1분에 그만큼 찬다). 단위도 서버가 보내게 바꿀 때 함께 */
const PER_MINUTE_QUANTITIES: ReadonlySet<string> = new Set(["stamina_regen", "mp_regen", "shield_regen"]);

const numberFormats = new Map<string, Intl.NumberFormat>();
function numberFormat(locale: Locale, digits: number): Intl.NumberFormat {
  const key = `${locale}:${digits}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    numberFormats.set(key, format);
  }
  return format;
}

/** 수(자리 나눔) */
export const formatNumber = (value: number, locale: Locale = getLocale()): string =>
  numberFormat(locale, 0).format(value);

/** 정수 문자열(금액·양)을 자리 나눔으로. 정수가 아니면 그대로 */
export function formatAmount(amount: string, locale: Locale = getLocale()): string {
  if (!/^-?\d+$/.test(amount)) return amount;
  try {
    return numberFormat(locale, 0).format(BigInt(amount));
  } catch {
    return amount;
  }
}

const milliFormats = new Map<string, Intl.NumberFormat>();

/**
 * 천분의 일 단위 정수를 소수로(뒤 0은 뺀다): 곱 16,800 → "16.8", 가중치 1500‰ → "1.5". 스탯 풀이(서버가 보낸 정수)를 보일 때 쓴다.
 * 수를 다시 계산하지 않고 단위만 바꾼다
 */
export function formatMilli(milli: number, locale: Locale = getLocale()): string {
  let format = milliFormats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 3 });
    milliFormats.set(locale, format);
  }
  return format.format(milli / 1000);
}

/** 성장 K(‰)를 소수 두 자리로(970 → "0.97"). K가 보이는 곳에서만 쓴다(D-449, 옛 화면처럼 값으로) */
export const formatK = (kPm: number, locale: Locale = getLocale()): string =>
  numberFormat(locale, 2).format(kPm / 1000);

/** 2차 스탯 값: 확률 모양은 %(‰ ÷ 10, 소수 한 자리), ‰ 양은 ×배율, 분당 양은 "n/분", 나머지는 수 */
export function formatStat(stat: RosterStat, locale: Locale = getLocale()): string {
  if (stat.shape === "probability") return `${numberFormat(locale, 1).format(stat.value / 10)}%`;
  if (PERMILLE_QUANTITIES.has(stat.id)) return `×${numberFormat(locale, 2).format(stat.value / 1000)}`;
  if (PER_MINUTE_QUANTITIES.has(stat.id))
    return m.roster_per_minute({ value: numberFormat(locale, 0).format(stat.value) }, { locale });
  return numberFormat(locale, 0).format(stat.value);
}

/** 부호 붙인 수("+3", "-2") — 버프 몫 */
export const formatSigned = (value: number, locale: Locale = getLocale()): string =>
  `${value > 0 ? "+" : ""}${numberFormat(locale, 0).format(value)}`;

/**
 * 2차 스탯 버프 몫(부호 붙임, 질문 354 → D-515): 확률 모양 "+5.0%", ‰ 양 "+0.10"(배율 더하기), 분당 양 "+5/분", 나머지 "+5".
 * 값은 서버가 보낸 몫 그대로다
 */
export function formatStatShare(stat: RosterStat, locale: Locale = getLocale()): string {
  const sign = stat.value < 0 ? "-" : "+";
  const size = { ...stat, value: Math.abs(stat.value) };
  if (PERMILLE_QUANTITIES.has(stat.id)) return `${sign}${numberFormat(locale, 2).format(size.value / 1000)}`;
  return `${sign}${formatStat(size, locale)}`;
}

/** 유닛 상태 분류(걸러 보기·정렬·줄 표시). 손이 필요한 것부터 */
export const UNIT_STATUSES = ["captive", "injured", "idle", "resting", "working"] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export function unitStatus(unit: RosterUnit): UnitStatus {
  if (unit.captive) return "captive";
  if (unit.injury.stage > 0) return "injured";
  if (unit.job === null) return "idle";
  return unit.job.phase === "rest" ? "resting" : "working";
}

const STATUS_LABELS = {
  captive: (locale) => m.units_status_captive({}, { locale }),
  injured: (locale) => m.units_status_injured({}, { locale }),
  idle: (locale) => m.units_status_idle({}, { locale }),
  resting: (locale) => m.units_status_resting({}, { locale }),
  working: (locale) => m.units_status_working({}, { locale }),
} satisfies Record<UnitStatus, Text>;

export const statusLabel = (status: UnitStatus, locale: Locale = getLocale()): string =>
  STATUS_LABELS[status](locale);

const INJURY_LABELS = [
  (locale: Locale) => m.roster_injury_1({}, { locale }),
  (locale: Locale) => m.roster_injury_2({}, { locale }),
  (locale: Locale) => m.roster_injury_3({}, { locale }),
] as const;

/** 부상 단계 이름(1 경상, 2 중상, 3 중태). 0이면 null */
export function injuryLabel(stage: number, locale: Locale = getLocale()): string | null {
  if (stage <= 0) return null;
  return INJURY_LABELS[Math.min(stage, 3) - 1]?.(locale) ?? null;
}

/** 걸러 보기의 종류 묶음: 시험 유닛 둘은 한 묶음 */
export type TypeFilter = "all" | "human" | "creature" | "android" | "cyborg" | "test";
export type StatusFilter = "all" | UnitStatus;

export interface UnitFilter {
  readonly type: TypeFilter;
  readonly status: StatusFilter;
  /** 거점 이름(""= 모두) */
  readonly base: string;
}

export const NO_FILTER: UnitFilter = { type: "all", status: "all", base: "" };

function typeMatches(type: UnitType, filter: TypeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "test") return type === "test_unit";
  return type === filter;
}

const statusRank = (unit: RosterUnit): number => UNIT_STATUSES.indexOf(unitStatus(unit));

/** 손이 필요한 순(포로 → 부상 무거운 순 → 직무 없음 → 쉼 → 일함), 같으면 이름·번호 순 */
export function sortUnits(units: readonly RosterUnit[], locale: Locale = getLocale()): RosterUnit[] {
  const collator = new Intl.Collator(locale, { numeric: true });
  return units.toSorted(
    (a, b) =>
      statusRank(a) - statusRank(b) ||
      b.injury.stage - a.injury.stage ||
      collator.compare(unitLabel(a, locale), unitLabel(b, locale)),
  );
}

export function filterUnits(units: readonly RosterUnit[], filter: UnitFilter): RosterUnit[] {
  return units.filter(
    (unit) =>
      typeMatches(unit.type, filter.type) &&
      (filter.status === "all" || unitStatus(unit) === filter.status) &&
      (filter.base === "" || unit.place?.base === filter.base),
  );
}

/** 목록에 있는 거점 이름(걸러 보기 고르기). 이름 순 */
export function basesOf(units: readonly RosterUnit[], locale: Locale = getLocale()): string[] {
  const names = new Set<string>();
  for (const unit of units) if (unit.place?.base) names.add(unit.place.base);
  return [...names].toSorted(new Intl.Collator(locale).compare);
}

/** 상태별 수(걸러 보기 칩 옆 수) */
export function statusCounts(units: readonly RosterUnit[]): Record<UnitStatus, number> {
  const counts: Record<UnitStatus, number> = { captive: 0, injured: 0, idle: 0, resting: 0, working: 0 };
  for (const unit of units) counts[unitStatus(unit)] += 1;
  return counts;
}
