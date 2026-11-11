// 운영자 콘솔(/ops) — 권한 목록·역할 기본 묶음·응답 모양. 서버(권한 판정·자료)와 기기(화면·체크박스)가 같은 목록을 쓴다.
// 결정: docs/adr/2026-11-08-operator-console.md(사용자 요청 2026-11-08 "개발자는 전체, 운영자는 2종류로 감시+가벼운통제 정도와
// 강한 통제까지 가능하게. 가능한 권한을 체크 박스처럼 부여하기도 할 수 있게 한다").
// 무엇을 할 수 있는지는 서버만 정한다(apps/server/src/ops/access.ts). 기기는 화면 편의로만 쓴다.
import type { Role } from "./roles.ts";

/**
 * 운영 권한 ID. 계정에 저장되는 값(ops_grants.permissions)이라 한 번 쓴 ID는 다시 쓰지 않는다(새 것은 끝에 더한다).
 * - view_*: 감시(조회)
 * - account_kick·account_ban·unit_stop·unit_rescue: 가벼운 통제
 * - unit_heal·unit_teleport·ledger_grant: 강한 통제
 * - manage_grants: 다른 계정에 운영 권한 체크박스 주기(개발자만)
 * - log_switch: 조회 감사 기록 켜기·끄기(관리자·개발자)
 * - faction_edit: 세력 정체성(이름·약어·색)·화폐 표시(이름·기호·3글자 약어) 고치기(강한 통제 — 관리자·개발자)
 * - emblem_moderate: 플레이어가 올린 세력 마크 보기·내리기·그 계정의 올리기 막기(가벼운 통제 — docs/adr/2026-11-11-faction-identity.md 5절).
 *   세계 스위치 "플레이어 마크 올리기 허용"을 바꾸는 것은 faction_edit다
 */
export const OPS_PERMISSIONS = [
  "view_players",
  "view_npcs",
  "view_economy",
  "view_audit",
  "view_server",
  "account_kick",
  "account_ban",
  "unit_stop",
  "unit_rescue",
  "unit_heal",
  "unit_teleport",
  "ledger_grant",
  "manage_grants",
  "log_switch",
  "faction_edit",
  "emblem_moderate",
] as const;

export type OpsPermission = (typeof OPS_PERMISSIONS)[number];

/** 화면에서 권한을 묶어 보이는 단계 */
export type OpsTier = "monitor" | "light" | "strong" | "manage";

export const OPS_PERMISSION_TIER: { readonly [P in OpsPermission]: OpsTier } = {
  view_players: "monitor",
  view_npcs: "monitor",
  view_economy: "monitor",
  view_audit: "monitor",
  view_server: "monitor",
  account_kick: "light",
  account_ban: "light",
  unit_stop: "light",
  unit_rescue: "light",
  unit_heal: "strong",
  unit_teleport: "strong",
  ledger_grant: "strong",
  manage_grants: "manage",
  log_switch: "manage",
  faction_edit: "strong",
  emblem_moderate: "light",
};

export function isOpsPermission(value: string): value is OpsPermission {
  return (OPS_PERMISSIONS as readonly string[]).includes(value);
}

const LIGHT: readonly OpsPermission[] = OPS_PERMISSIONS.filter(
  (p) => OPS_PERMISSION_TIER[p] === "monitor" || OPS_PERMISSION_TIER[p] === "light",
);
const STRONG: readonly OpsPermission[] = OPS_PERMISSIONS.filter((p) => OPS_PERMISSION_TIER[p] !== "manage");

/**
 * 역할마다 기본으로 가지는 운영 권한. 계정마다 체크박스로 더 줄 수 있다(빼지는 못한다).
 * 사용자 결정(2026-11-08): 운영자(gm) = 감시 + 약한 통제, 관리자(admin) = + 강한 통제 + 로그 스위치, 개발자(dev) = 전체.
 * 권한 부여(manage_grants)는 개발자 기능이다("권한부여는 개발자가하는 기능이다. 운영자는 불가능")
 */
export const OPS_ROLE_DEFAULTS: { readonly [R in Role]: readonly OpsPermission[] } = {
  player: [],
  gm: LIGHT,
  admin: [...STRONG, "log_switch"],
  dev: OPS_PERMISSIONS,
};

/** 운영자 콘솔을 여는 역할(화면 주소 /ops). 체크박스 권한은 이 역할 위에 더해진다 */
export const OPS_CONSOLE_ROLES: readonly Role[] = ["gm", "dev", "admin"];

/**
 * 운영 스위치(표 ops_switches, 기본 꺼짐). view_audit = 조회 감사 기록(2차맵 전체 보기·행성 정의 조회).
 * 계정·통제·편집 저장 같은 책임 기록은 스위치와 상관없이 늘 남긴다
 */
export const OPS_SWITCHES = ["view_audit"] as const;
export type OpsSwitch = (typeof OPS_SWITCHES)[number];

/** 감사 기록 분류(화면 거르기). 동작 이름 앞부분으로 묶는다 */
export const AUDIT_CATEGORIES = {
  account: ["account.", "cli."],
  ops: ["ops."],
  map: ["second_map."],
  tuning: ["tuning."],
  content: ["content.", "battle_lab_preset."],
  planet: ["planet_editor.", "planet_draft.", "planet_library.", "star_system."],
  world: ["world."],
} as const satisfies Record<string, readonly string[]>;
export type AuditCategory = keyof typeof AUDIT_CATEGORIES;
export const AUDIT_CATEGORY_IDS = [
  "account",
  "ops",
  "map",
  "tuning",
  "content",
  "planet",
  "world",
] as const satisfies readonly AuditCategory[];

/** 역할 기본 + 계정에 준 권한 → 실효 권한(OPS_PERMISSIONS 차례, 중복 없음). 콘솔 역할이 없으면 빈 목록 */
export function effectiveOpsPermissions(roles: readonly Role[], granted: readonly string[]): OpsPermission[] {
  if (!roles.some((role) => OPS_CONSOLE_ROLES.includes(role))) return [];
  const set = new Set<string>(granted);
  for (const role of roles) for (const permission of OPS_ROLE_DEFAULTS[role]) set.add(permission);
  return OPS_PERMISSIONS.filter((permission) => set.has(permission));
}

// ── 응답 모양 ──

/** 소유 주체 종류: 유저(사용자) 또는 NPC 세력 */
export type OpsOwnerKind = "user" | "faction";

export interface OpsAccess {
  permissions: OpsPermission[];
  /** 체크박스로 받은 것(역할 기본은 빠진다) */
  granted: OpsPermission[];
}

/**
 * 행성 하나의 합(현황 탭 행성별 표, docs/adr/2026-11-11-planet-scope.md). 2차맵·유닛은 메모리 월드, 나머지는 DB 기준.
 * 전투는 표(world_battles)에 행성 칸이 없어 아직 행성별로 세지 못한다(ADR 후속)
 */
export interface OpsPlanetTotals {
  planetId: string;
  /** 이 세계의 플레이 행성인지(아니면 자료만 남은 행성 ID — 살펴볼 것) */
  playable: boolean;
  maps: number;
  units: number;
  moving: number;
  cities: number;
  humans: number;
  buildings: number;
  /** 오염이 쌓인 1차맵 칸 수(정원사) */
  pollutionCells: number;
  /** 오는 중·싸우는 중인 정원사 웨이브 수 */
  activeWaves: number;
}

export interface OpsServerOverview {
  nowMs: number;
  uptimeSec: number;
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number; externalMb: number };
  wsConnections: number;
  world: {
    state: "none" | "recovering" | "ready" | "failed";
    issues: number;
    bootMs: number | null;
    maps: number;
    units: number;
    moving: number;
    npcRuntime: boolean;
  };
  counts: {
    users: number;
    bannedUsers: number;
    online: number;
    cyborgs: number;
    factionsNpc: number;
    factionsPlayer: number;
    cities: number;
    humans: number;
    buildings: number;
    wars: number;
  };
  recent: {
    clientErrors24h: number;
    audit24h: number;
    signups24h: number;
  };
  /** 행성마다 합(플레이 행성이 먼저, 대표가 맨 앞). 옛 서버 응답에는 없다 */
  planets?: OpsPlanetTotals[];
}

export interface OpsPlayerRow {
  id: string;
  loginId: string;
  roles: Role[];
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
  createdAt: string;
  online: boolean;
  /** 마지막으로 끊긴 시각(접속 중이면 null, 기록 없으면 null) */
  offlineSinceMs: number | null;
  cyborgName: string | null;
  level: number | null;
  factionId: number | null;
  factionName: string | null;
  ownerId: number | null;
  units: number;
  /** 기본 화폐 잔고(최소 단위, 문자열 — BigInt) */
  credit: string;
}

export interface OpsBalance {
  asset: string;
  location: number | null;
  /** 최소 단위 정수(문자열) */
  balance: string;
}

export interface OpsUnitRow {
  id: number;
  kind: number;
  ownerId: number;
  ownerKind: OpsOwnerKind | null;
  ownerLabel: string;
  planetId: string;
  mapKey: number;
  cellX: number;
  cellY: number;
  moving: boolean;
  injury: number;
  captive: boolean;
}

export interface OpsPlayerDetail {
  player: OpsPlayerRow;
  cyborg: {
    name: string;
    temperament: string;
    level: number;
    exp: number;
    rebirths: number;
    faith: number;
    faithPoints: number;
    religion: string | null;
    /** STR·DEX·AGI·VIT·INT·WIS */
    initial: number[];
    kPm: number[];
    elements: number[] | null;
    startCityId: number;
    unitId: number | null;
    createdAtMs: number;
  } | null;
  balances: OpsBalance[];
  units: OpsUnitRow[];
  items: OpsItemRow[];
  skills: OpsSkillRow[];
  sessions: { count: number; lastSeen: string | null };
  audit: OpsAuditRow[];
}

export interface OpsItemRow {
  id: number;
  itemId: string;
  location: number;
  slot: number | null;
  quantity: number;
  durability: number | null;
  maxDurability: number | null;
  source: string;
}

export interface OpsSkillRow {
  unitId: number;
  skillId: string;
  grade: number;
  source: string;
}

/** 정체성·화폐 표시 값이 어디서 왔나 */
export type OpsProfileSource = "preset" | "default" | "admin";

export interface OpsFactionRow {
  id: number;
  kind: "npc" | "player";
  code: string | null;
  /** 세력 이름(정체성 표, 없으면 나라 이름·코드) */
  name: string;
  /** 약어(2~5자, 세계 안에서 하나). 정체성이 아직 없으면 null */
  shortName: string | null;
  /** 시그니처 컬러 #rrggbb. 아직 없으면 null */
  color: string | null;
  profileSource: OpsProfileSource | null;
  /** 쓰는 화폐(원장 자산)와 표시 */
  currency: { asset: string; name: string; symbol: string; ticker: string } | null;
  /** 그 화폐로 가진 잔고(최소 단위, 문자열) */
  treasury: string;
  /** 봉신(이 세력을 종주로 둔 세력) 수 */
  vassals: number;
  /** 불가침 쌍 수 */
  truces: number;
  /** 그 세력 도시 휴먼의 평균 만족도(밀리점, 휴먼이 없으면 null) */
  satisfactionMilli: number | null;
  /** 도시 주거 합 */
  housing: number;
  parentId: number | null;
  regime: string;
  fixed: boolean;
  techLevel: number;
  dissolved: boolean;
  cities: number;
  humans: number;
  units: number;
  members: number;
  ownerId: number | null;
  credit: string;
  wars: number;
}

export interface OpsCurrencyRow {
  asset: string;
  name: string;
  symbol: string;
  ticker: string;
  source: OpsProfileSource;
  /** 찍는 나라(자기 프리셋 화폐를 가진 고정 나라). 없으면 null(기준 통화 등) */
  issuer: { id: number; name: string } | null;
  /** 이 화폐를 쓰는 세력 수(살아 있는 것) */
  factions: number;
  /** 유저·세력 보유 합(최소 단위, 문자열), 보유자 수 */
  held: string;
  holders: number;
}

export interface OpsCityRow {
  id: number;
  name: string | null;
  factionId: number;
  factionName: string;
  planetId: string;
  mapKey: number;
  cellX: number;
  cellY: number;
  start: boolean;
  housing: number;
  humans: number;
  development: number;
  adminLevel: number;
  researchLevel: number;
  necessitiesPm: number | null;
  mayorUnitId: number | null;
}

export interface OpsFactionDetail {
  faction: OpsFactionRow;
  traits: number[] | null;
  researchProgress: number;
  aiStep: number;
  bornOf: number | null;
  rebelOf: number | null;
  cities: OpsCityRow[];
  wars: { otherId: number; otherName: string; state: "war" | "truce"; atMs: number }[];
  balances: OpsBalance[];
  members: { id: string; loginId: string }[];
  units: OpsUnitRow[];
}

export interface OpsUnitDetail {
  unit: OpsUnitRow;
  speed: number;
  size: number;
  job: { kind: number; phase: number; progressMs: number; fatigue: number };
  injuryUntilMs: number | null;
  heldBy: number | null;
  human: {
    cityId: number | null;
    satisfactionMilli: number;
    level: number;
    bornAtMs: number;
    /** 서버 시각 기준 나이(ms) */
    ageMs: number;
    lifespanMs: number;
    rebirths: number;
    stats: number[] | null;
    elements: number[] | null;
  } | null;
  vitals: {
    hp: number;
    maxHp: number;
    armor: number;
    maxArmor: number;
    shield: number;
    maxShield: number;
  } | null;
  skills: OpsSkillRow[];
  items: OpsItemRow[];
  cargo: OpsBalance[];
}

export interface OpsAuditRow {
  id: number;
  at: string;
  actorKind: string;
  actorId: string | null;
  actorLoginId: string | null;
  action: string;
  targetId: string | null;
  /** 대상이 계정이면 그 아이디(없으면 null) */
  targetLoginId: string | null;
  before?: unknown;
  after?: unknown;
  meta?: unknown;
  ip: string | null;
}

export interface OpsAssetTotal {
  asset: string;
  /** 유저·세력이 가진 합(최소 단위, 문자열) */
  held: string;
  /** 시스템 계정 잔고 합(발행 −, 소멸 +) */
  system: string;
  holders: number;
}

export interface OpsEconomy {
  totals: OpsAssetTotal[];
  /** 고른 자산의 상위 보유 주체 */
  top: { ownerId: number; ownerKind: OpsOwnerKind | null; label: string; balance: string }[];
  /** 최근 거래 중 금액이 큰 항목 */
  largeEntries: {
    txId: number;
    kind: string;
    atMs: number;
    asset: string;
    ownerId: number | null;
    label: string;
    amount: string;
  }[];
  /** 운영자 지급·회수 거래(최근) */
  operatorTx: { txId: number; kind: string; atMs: number; key: string | null }[];
}

/** 유닛 통제 결과 코드 */
export const OPS_UNIT_RESULTS = [
  "ok",
  "not_found",
  "not_ready",
  "not_standable",
  "unsupported_kind",
  "failed",
] as const;
export type OpsUnitResult = (typeof OPS_UNIT_RESULTS)[number];
