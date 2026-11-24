// 플레이어 가문 표(질문 926~935 답, docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 926~935 답)") — schema.ts가 다시 내보낸다
// (그 파일 줄 수 때문에 따로 둔다). 둘 다 세계 표라 시험 세계 새로 시작(reset-world)에서 지운다(남길 표 목록에 넣지 않는다).
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { factions, users } from "./schema.ts";

/**
 * 가문 구성원: 사용자 → 가문(세력 행, kind = player). 사용자마다 한 가문. 나라는 하나(기획 D-569 — D-216 이중 소속을 대신함): 가문원의
 * 시민권(faction_members·cyborgs.faction_id)은 가문 소속 도시의 나라로 맞춘다(world/houseTies.ts). 가입은 house_requests
 */
export const houseMembers = pgTable(
  "house_members",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    factionId: bigint("faction_id", { mode: "number" })
      .notNull()
      .references(() => factions.id, { onDelete: "cascade" }),
    /** leader(가문장) | member */
    role: text("role").notNull(),
    joinedAtMs: bigint("joined_at_ms", { mode: "number" }).notNull(),
    /**
     * 기여도(gov-fix-4 — 사용자 결정 D-591 2532 (1) 나 "가문 안 직위나 기여도"): 이 가문에 든 뒤 가문 금고에 넣은 기부 합(기본 화폐 최소 단위, house_donate —
     * factionIdentity/housePolicy.ts가 더한다). 계승 서열이 직위 다음에 본다(governance/succession.ts rankMembers). 가문을 떠나면 줄과 함께 사라진다. 가문세는 아직
     * 세지 않는다 [임시 2664]. 직전 판 앱은 모른 채 돈다(기본 0)
     */
    contribution: bigint("contribution", { mode: "bigint" }).notNull().default(0n),
  },
  (table) => [
    index("house_members_faction_idx").on(table.factionId),
    check("house_members_role", sql`${table.role} in ('leader', 'member')`),
  ],
);

/**
 * 가문장이 미리 정한 후계자(질문 2491 — 사용자 결정 D-588 5 "지배 가문의 서열이나 미리 지정한 후계자로 자동 계승", 줄기 governance-6): 가문마다 한 줄.
 * 지배 가문의 가문장(= 국가 지도자) 자리가 비면 이 사람이 먼저 잇는다(그때 가문원이어야 한다 — 아니면 서열, apps/server/src/governance/succession.ts).
 * 세계 표(시험 세계 새로 시작에서 지운다). 새 표만 더해서 직전 판 앱은 모른 채 돈다
 */
export const houseHeirs = pgTable("house_heirs", {
  factionId: bigint("faction_id", { mode: "number" })
    .primaryKey()
    .references(() => factions.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  designatedAtMs: bigint("designated_at_ms", { mode: "number" }).notNull(),
});

/**
 * 가문 마크·이름 신고(질문 930 나): 신고한 계정마다 한 줄(같은 가문을 두 번 세지 않는다). 운영자가 넘기거나 마크를 내리면 그 가문 줄을 지운다.
 * 하루 횟수 제한(설정 칸 house_report_daily)은 created_at_ms로 센다
 */
export const houseReports = pgTable(
  "house_reports",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    factionId: bigint("faction_id", { mode: "number" })
      .notNull()
      .references(() => factions.id, { onDelete: "cascade" }),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("house_reports_once_idx").on(table.factionId, table.reporterId),
    index("house_reports_reporter_idx").on(table.reporterId, table.createdAtMs),
  ],
);

/**
 * 가문 초대·가입 신청(질문 985 다): 가문 × 사람마다 한 줄(초대와 신청이 맞으면 바로 든다 — 줄을 지운다). 답하거나 거두거나 expires_at_ms가
 * 지나면 지운다(지난 줄은 명령마다 지우고 조회는 거른다). kind: invite(가문장 → 그 사람) | apply(그 사람 → 가문)
 */
export const houseRequests = pgTable(
  "house_requests",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    factionId: bigint("faction_id", { mode: "number" })
      .notNull()
      .references(() => factions.id, { onDelete: "cascade" }),
    /** 초대받은 사람 또는 신청한 사람 */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** 보낸 사람(초대 = 가문장, 신청 = 그 사람) */
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
    expiresAtMs: bigint("expires_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("house_requests_pair_idx").on(table.factionId, table.userId),
    index("house_requests_user_idx").on(table.userId),
    index("house_requests_expires_idx").on(table.expiresAtMs),
    check("house_requests_kind", sql`${table.kind} in ('invite', 'apply')`),
  ],
);

/**
 * 가문 소식(@terra/shared/house HOUSE_NOTICE_KINDS): 받은 사람마다 한 줄, 확인하면 지운다. 가문 이름은 그때 값을 적어 둔다(가문 이름이 바뀌거나
 * 가문이 사라져도 읽힌다). 처리할 일(house_notice)과 세력 화면 "내 가문" 칸이 읽는다
 */
export const houseNotices = pgTable(
  "house_notices",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    factionId: bigint("faction_id", { mode: "number" }).references(() => factions.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    houseName: text("house_name").notNull(),
    /** 상대 사이보그 이름(그때 값) */
    otherName: text("other_name"),
    reason: text("reason"),
    count: integer("count").notNull().default(0),
    createdAtMs: bigint("created_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    index("house_notices_user_idx").on(table.userId, table.createdAtMs),
    check("house_notices_reason", sql`char_length(${table.reason}) <= 200`),
  ],
);

/**
 * 가문 소속 도시(기획 D-565): 가문 행마다 한 줄. 가문은 소속 도시를 고르고 그 도시가 속한 나라(최상위 세력)의 가문이 된다 — 나라는
 * factions.born_of에 함께 적는다(시야 공유 D-250·가입 목록이 읽는다). 소속 도시는 세금 납부·랭킹 집계에 쓴다. 도시가 폐허가 되어
 * world_cities 행이 지워져도 남는다(외래 키 없음 — 가문 나라는 그대로, 가문장이 다시 고른다).
 * 마이그레이션이 이 표 전의 가문을 가문장 사이보그의 내 도시(cyborgs.start_city_id)로 채운다. 세계 표라 시험 세계 새로 시작에서 지운다
 */
export const houseHomes = pgTable("house_homes", {
  factionId: bigint("faction_id", { mode: "number" })
    .primaryKey()
    .references(() => factions.id, { onDelete: "cascade" }),
  /** 소속 도시(아직 도시·국가에 가입하지 않고 첫 가입 공고 중이면 null — ADR 2026-11-24-house-membership-separation.md) */
  cityId: bigint("city_id", { mode: "number" }),
  /** 소속 도시를 마지막으로 정한 시각(창설 포함 — 다시 바꾸기 대기 house_home_wait_ms가 센다) */
  setAtMs: bigint("set_at_ms", { mode: "number" }).notNull(),
  /**
   * 공고한 새 소속 도시(D-570 "가문장이 미리 공고하고 원치않은 가문세력원은 탈퇴한다")와 옮기는 시각(공고 + 설정 칸 house_home_notice_ms). 둘 다
   * 있거나 둘 다 null. 그 시각이 지나면 서버가 가문 모두를 옮기고 비운다(factionIdentity/houseMoves.ts). 외래 키 없음(폐허가 되면 옮기지 않고 비운다)
   */
  pendingCityId: bigint("pending_city_id", { mode: "number" }),
  pendingAtMs: bigint("pending_at_ms", { mode: "number" }),
});

/**
 * 유닛 단위 가문(기획 D-569 1744 "고용한 주체의 가문 소속에 들어간다"): 고용한 유닛마다 한 줄 — 고용한 사람(user_id)의 그때 가문. 사이보그 본체는
 * 줄이 없다(주인의 가문을 따른다). 주인이 그 가문을 나가거나 내보내지거나 해산하면 지운다(무소속, D-565 1747 — world/houseTies.ts). 쓰기
 * 대기열이 유닛과 같은 커밋에 쓴다. 유닛 외래 키는 unit_effects와 같은 까닭으로 두지 않는다. 세계 표(시험 세계 새로 시작에서 지운다)
 */
export const houseUnits = pgTable(
  "house_units",
  {
    unitId: bigint("unit_id", { mode: "number" }).primaryKey(),
    factionId: bigint("faction_id", { mode: "number" })
      .notNull()
      .references(() => factions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    setAtMs: bigint("set_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    index("house_units_faction_idx").on(table.factionId),
    index("house_units_user_idx").on(table.userId),
  ],
);

/**
 * NPC 도시의 가문(기획 D-569 "도시국가든 도시의 가문들이 존재하며 가문장이 유닛을 고용한다"·D-212 NPC도 같은 규칙, 질문 1848 답): NPC 도시마다
 * 도시 등급에 따른 수(D-573, 설정 칸 house_npc_city_houses_l*). 세력 행(factions)이 아니다 — NPC 사회 런타임·나라 목록이 세력 행을 읽어 NPC 세력으로 세지 않게 따로 둔다. 나라 = 그
 * 도시의 지금 주인, 가문장 = 지배 가문은 국가 지도자·그 밖은 시장이나 앞선 가문원(저장하지 않고 읽을 때 본다). 이름 = 세울 때 그 사람의 성(그 나라 팩 휴먼
 * 이름 목록), 없으면 도시 이름. 도시가 폐허가 되어도 남는다(외래 키 없음 — 같은 도시 ID로 복원되면 그 가문). ID는 서버가 정한다(NPC 런타임
 * 하나만 만든다, npc/cityHouses.ts). 세계 표(시험 세계 새로 시작에서 지운다)
 */
export const npcHouses = pgTable(
  "npc_houses",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    /** 바뀜(D-573 — 질문 2011 나): 도시 등급마다 여러 가문이라 도시 ID는 하나가 아니다(고유 제약을 풀었다 — 직전 판 앱은 도시마다 하나만 본다) */
    cityId: bigint("city_id", { mode: "number" }).notNull(),
    name: text("name").notNull(),
    foundedAtMs: bigint("founded_at_ms", { mode: "number" }).notNull(),
    /** 운영자·편집기 가문 7축 성향 덮어쓰기(docs/adr/2026-11-20-npc-autonomous-ai.md). null = 가문장·가문원 실시간 합성 */
    traitsOverride: smallint("traits_override").array(),
  },
  (table) => [
    index("npc_houses_city_idx").on(table.cityId),
    check(
      "npc_houses_traits_override",
      sql`${table.traitsOverride} is null or (cardinality(${table.traitsOverride}) = 7 and 0 <= all(${table.traitsOverride}) and 1000 >= all(${table.traitsOverride}))`,
    ),
  ],
);

/**
 * NPC 휴먼의 가문(D-569 — 생성될 때 그 도시 가문에 든다): 휴먼마다 한 줄, 한 번 들면 그대로다(사는 도시가 바뀌어도). 유닛 외래 키는 house_units와
 * 같은 까닭으로 두지 않는다 — 죽은 휴먼 줄은 런타임이 지우고, 남은 것은 켤 때 휴먼 행이 없는 줄을 지운다(npc/cityHouses.ts). 쓰기 대기열이 묶어 쓴다
 */
export const npcHouseUnits = pgTable(
  "npc_house_units",
  {
    unitId: bigint("unit_id", { mode: "number" }).primaryKey(),
    houseId: bigint("house_id", { mode: "number" })
      .notNull()
      .references(() => npcHouses.id, { onDelete: "cascade" }),
    setAtMs: bigint("set_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [index("npc_house_units_house_idx").on(table.houseId)],
);

/**
 * 도시의 정책(기획 D-570 "해당 국가나 도시의 정책에 따름"·D-526 받는 쪽이 정함, 질문 2018 답): 도시마다 한 줄. 지금은 가문 이동 정책 하나 —
 * 가문이 이 도시로 소속 도시를 옮길 때 가문원마다 + 가입비 / − 지원금(최소 단위, null = 정하지 않음 → 나라 정책 factions.house_entry_fee). 정하는
 * 사람 = 그 도시를 가진 가문의 가문장(factionIdentity/houseEntryPolicy.ts). NPC 도시는 줄이 없다(나라 정책 — NPC 나라는 성향 규칙식). 외래 키 없음
 * (도시가 폐허가 되어 world_cities 행이 지워져도 남고, 읽을 때 지금 도시만 본다). 세계 표(시험 세계 새로 시작에서 지운다)
 */
export const cityPolicies = pgTable("city_policies", {
  cityId: bigint("city_id", { mode: "number" }).primaryKey(),
  houseEntryFee: bigint("house_entry_fee", { mode: "bigint" }),
  /**
   * 같은 나라의 다른 가문이 이 도시에 짓게 하나(기획 D-574 2124 — "그 도시 가문의 정책", 자기 가문은 늘 짓는다). null = 정하지 않음(설정 칸
   * house_city_build_default). 정하는 사람은 가문 이동 정책과 같다(factionIdentity/houseBuildPolicy.ts). 바뀜(house-8): 칸을 더하기만 했다
   */
  houseBuild: boolean("house_build"),
  /** 마지막으로 정한 시각·사람(감사 기록과 같은 값) */
  setAtMs: bigint("set_at_ms", { mode: "number" }).notNull(),
  setBy: uuid("set_by"),
});

/**
 * 가문의 정책(기획 D-574 2150 — 가문 금고는 가문원 기부 + 가문원 수입의 일부를 가문세로, 세율은 가문장이 정한다 — 기획 해석): 가문(세력 행)마다
 * 한 줄, 줄이 없으면 세율 0. tax_pm = 가문원 수입(임금·사업장 배당 — factionIdentity/houseTax.ts)에서 떼어 가문 금고로 보내는 몫(‰, 상한은 설정 칸
 * house_tax_max_pm — 상한이 내려가면 읽을 때 상한으로 자른다). 세계 표(시험 세계 새로 시작에서 지운다)
 */
export const housePolicies = pgTable(
  "house_policies",
  {
    factionId: bigint("faction_id", { mode: "number" })
      .primaryKey()
      .references(() => factions.id, { onDelete: "cascade" }),
    taxPm: integer("tax_pm").notNull().default(0),
    /** 마지막으로 정한 시각·사람(감사 기록과 같은 값) */
    setAtMs: bigint("set_at_ms", { mode: "number" }).notNull(),
    setBy: uuid("set_by"),
  },
  (table) => [check("house_policies_tax_pm", sql`${table.taxPm} between 0 and 1000`)],
);
