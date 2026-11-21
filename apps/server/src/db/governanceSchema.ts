// 나라 의결 표(docs/adr/2026-11-21-governance.md — 기획 D-5057·D-217·질문 2351~2365 답) — schema.ts가 다시 내보낸다(그 파일 줄 수 때문에 따로
// 둔다). 모두 세계 표라 시험 세계 새로 시작(reset-world)에서 지운다(남길 표 목록에 넣지 않는다). 새 표만 더해서 직전 판 앱은 모른 채 돈다.
// 쓰는 곳은 apps/server/src/governance/store.ts 하나다(서버가 하나라 의결 서비스가 순서대로 쓴다).
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { factions } from "./schema.ts";

/**
 * 안건 하나(D-5057). nation_id = 나라(세력 행). proposer_key = 올린 가문(p:/n:)·주주(o:) 열쇠, 시스템(임기 끝 자동 선출)이면 null.
 * payload = 종류별 칸(체제 전환 목표 regime·선전포고 상대 targetNationId·해임 뒤 다시 뽑기의 barred·직권 결정 byAuthority).
 * result = 셈 결과(찬반·후보 표·투표권·정족수·문턱·까닭). 시각은 서버 ms(실제 시간 D-5030)
 */
export const governanceAgendas = pgTable(
  "governance_agendas",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    nationId: bigint("nation_id", { mode: "number" })
      .notNull()
      .references(() => factions.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** 열 때 체제 */
    regime: text("regime").notNull(),
    proposerKey: text("proposer_key"),
    proposerUser: uuid("proposer_user"),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    openedAtMs: bigint("opened_at_ms", { mode: "number" }).notNull(),
    /** 선출 후보 등록 끝(선출만) */
    registerUntilMs: bigint("register_until_ms", { mode: "number" }),
    closesAtMs: bigint("closes_at_ms", { mode: "number" }).notNull(),
    /** open | passed | enacted | failed | cancelled */
    status: text("status").notNull().default("open"),
    result: jsonb("result"),
    decidedAtMs: bigint("decided_at_ms", { mode: "number" }),
    /** 집행 시각(가결 뒤 유예 — D-131) */
    effectAtMs: bigint("effect_at_ms", { mode: "number" }),
    enactedAtMs: bigint("enacted_at_ms", { mode: "number" }),
  },
  (table) => [
    index("governance_agendas_nation_idx").on(table.nationId, table.status),
    check(
      "governance_agendas_kind",
      sql`${table.kind} in ('leader_election', 'leader_removal', 'regime_change', 'war_declaration', 'tax_change', 'city_independence', 'treasury_share_sale', 'peace', 'currency_stage', 'house_independence', 'treasury_share_buy', 'treaty')`,
    ),
    check(
      "governance_agendas_status",
      sql`${table.status} in ('open', 'passed', 'enacted', 'failed', 'cancelled')`,
    ),
    check("governance_agendas_regime", sql`${table.regime} in ('dictatorship', 'democracy', 'capitalism')`),
  ],
);

/**
 * 표 하나(공개 투표·위임 없음 — 2365 가). voter_key = 가문(p:/n: — 민주주의 가문마다 한 표, 2355 가)·주주(o: — 자본주의 지분, 2356 가).
 * 닫힐 때까지 바꿀 수 있다(같은 열쇠 한 줄). weight = 던질 때 무게(화면용 — 셈은 닫을 때 그때 투표권으로 다시 센다)
 */
export const governanceVotes = pgTable(
  "governance_votes",
  {
    agendaId: bigint("agenda_id", { mode: "number" })
      .notNull()
      .references(() => governanceAgendas.id, { onDelete: "cascade" }),
    voterKey: text("voter_key").notNull(),
    /** 던진 플레이어(NPC면 null) */
    userId: uuid("user_id"),
    npc: boolean("npc").notNull().default(false),
    /** yes | no | abstain | 후보 가문 열쇠 */
    choice: text("choice").notNull(),
    weight: bigint("weight", { mode: "bigint" }).notNull(),
    castAtMs: bigint("cast_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agendaId, table.voterKey] }),
    check("governance_votes_key", sql`${table.voterKey} ~ '^[pno]:[1-9][0-9]{0,15}$'`),
  ],
);

/** 선출 후보(스스로 등록 — 2358 가). house_key = p:/n: 가문 열쇠 */
export const governanceCandidates = pgTable(
  "governance_candidates",
  {
    agendaId: bigint("agenda_id", { mode: "number" })
      .notNull()
      .references(() => governanceAgendas.id, { onDelete: "cascade" }),
    houseKey: text("house_key").notNull(),
    userId: uuid("user_id"),
    registeredAtMs: bigint("registered_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agendaId, table.houseKey] }),
    check("governance_candidates_key", sql`${table.houseKey} ~ '^[pn]:[1-9][0-9]{0,15}$'`),
  ],
);

/**
 * 나라마다 의결 상태 한 줄. ruling_house_key = 선출로 정한 지배 가문(2358 가 — null이면 처음 규칙: NPC 나라는 수도에서 처음 세운 가문 D-574 10,
 * 플레이어 가문 나라는 그 가문). term_ends_at_ms = 임기 끝(민주주의·자본주의 — 2357, 독재는 null). share_votes_suspended = 독재로 바뀌며 지배
 * 쪽이 아닌 지분이 의결권을 잃었다(D-349 — 몰수 아님)
 */
export const governanceState = pgTable("governance_state", {
  nationId: bigint("nation_id", { mode: "number" })
    .primaryKey()
    .references(() => factions.id, { onDelete: "cascade" }),
  rulingHouseKey: text("ruling_house_key"),
  electedAtMs: bigint("elected_at_ms", { mode: "number" }),
  termEndsAtMs: bigint("term_ends_at_ms", { mode: "number" }),
  shareVotesSuspended: boolean("share_votes_suspended").notNull().default(false),
  updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  /** 지도자 빈자리가 된 시각(질문 2403 답 D-582 — 해임 뒤 다시 뽑기가 실패하면). 선출로 채우면 null. 직전 판 앱은 읽지 않는다 */
  vacantSinceMs: bigint("vacant_since_ms", { mode: "number" }),
});

/**
 * 자본주의 NPC 나라 처음 지분을 세운 가문으로 옮긴 기록(기획 D-582 — 도시 지분은 그 도시를 처음 세운 NPC 가문, 수도는 지배 가문. 줄기 governance-2).
 * 도시마다 한 번만 옮긴다(그 뒤 국고에 생긴 지분 — 점령 몰수 D-298·재발행 D-444 — 은 국고 몫이라 옮기지 않는다). 세계 표(시험 세계 새로 시작에서 지운다)
 */
export const governanceShareFixups = pgTable("governance_share_fixups", {
  cityId: bigint("city_id", { mode: "number" }).primaryKey(),
  /** 받은 가문 열쇠(p:/n:) */
  houseKey: text("house_key").notNull(),
  /** 옮긴 주 수(10진 문자열이 아니라 정수 — 도시마다 1000주 출발값) */
  shares: bigint("shares", { mode: "number" }).notNull(),
  doneAtMs: bigint("done_at_ms", { mode: "number" }).notNull(),
});

/**
 * 나라마다 지배 쪽 지분을 가진 가문(줄기 governance-3 — 질문 2432 나 답: 쿠데타·수도 이전으로 지배 가문이 바뀌면 지배 쪽 지분이 새 지배 가문을 따른다,
 * D-580 6·D-582·D-574 10·D-344). house_key = 지금 지배 쪽 지분을 가진 가문(p:/n:). treasury_kept = 지분 과반을 사서 독재가 된 나라(질문 2432 (다) 답 D-583 —
 * 국고 지분은 국고에 남는다: 배당은 받고 의결권은 없다). 세계 표(시험 세계 새로 시작에서 지운다). 새 표라 직전 판 앱은 모른 채 돈다
 */
export const governanceShareHouses = pgTable("governance_share_houses", {
  nationId: bigint("nation_id", { mode: "number" })
    .primaryKey()
    .references(() => factions.id, { onDelete: "cascade" }),
  houseKey: text("house_key"),
  treasuryKept: boolean("treasury_kept").notNull().default(false),
  updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
});

/**
 * 군사 쿠데타 한 번(질문 2433 답 — 기술 기본값 가·다·라·마 + D-583 나 가: 혁명군(일으킨 가문) 대 정부군(지배 가문원 + 수도 경비대), 누구나 어느 편이든
 * 든다). status = gathering(참가 받는 중) | won | lost | cancelled. result = 편마다 힘·참가자·전투 결과·비용. 세계 표(새로 시작에서 지운다)
 */
export const governanceCoups = pgTable(
  "governance_coups",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    nationId: bigint("nation_id", { mode: "number" })
      .notNull()
      .references(() => factions.id, { onDelete: "cascade" }),
    /** 일으킨 가문(p:/n:) */
    houseKey: text("house_key").notNull(),
    /** 일으킨 플레이어(NPC 가문이면 null) */
    userId: uuid("user_id"),
    openedAtMs: bigint("opened_at_ms", { mode: "number" }).notNull(),
    /** 참가 받기 끝 = 전투 시각 */
    gatherUntilMs: bigint("gather_until_ms", { mode: "number" }).notNull(),
    /** 쿠데타 전투를 하는 도시(줄기 gov-coup — D-588 2492 가 "모든 도시에서 누구나"). null = 옛 줄(수도) */
    cityId: bigint("city_id", { mode: "number" }),
    status: text("status").notNull().default("gathering"),
    result: jsonb("result"),
    decidedAtMs: bigint("decided_at_ms", { mode: "number" }),
  },
  (table) => [
    index("governance_coups_nation_idx").on(table.nationId, table.status),
    index("governance_coups_house_idx").on(table.houseKey, table.openedAtMs),
    check("governance_coups_status", sql`${table.status} in ('gathering', 'won', 'lost', 'cancelled')`),
    check("governance_coups_house", sql`${table.houseKey} ~ '^[pn]:[1-9][0-9]{0,15}$'`),
  ],
);

/**
 * 쿠데타 참가(D-583 2433 나 가 — 누구나 어느 편이든). joiner_key = u:<사용자 UUID>(플레이어 — 그 사람 유닛) | n:<NPC 가문>(성향 규칙식). side = rebel | government.
 * 한 참가자는 한 편만(바꾸면 덮어쓴다 — 참가 받기 끝까지)
 */
export const governanceCoupSides = pgTable(
  "governance_coup_sides",
  {
    coupId: bigint("coup_id", { mode: "number" })
      .notNull()
      .references(() => governanceCoups.id, { onDelete: "cascade" }),
    joinerKey: text("joiner_key").notNull(),
    userId: uuid("user_id"),
    side: text("side").notNull(),
    /** 들어갈 때 낸 힘(화면용 — 셈은 전투 때 다시 본다) */
    power: integer("power").notNull().default(0),
    /**
     * 데려온 병력(거울 세계 유닛 ID 배열 — 줄기 governance-5, 질문 2455 답 D-583 "참전 = 병력을 데려온다"). 플레이어만 적는다(NPC 가문은 가문원). null = 옛 줄(그때는
     * 전투 때 그 사람 유닛을 모두 셌다). 빈 배열 = 병력 없이 편만 듦(보상 없음)
     */
    units: jsonb("units").$type<number[]>(),
    joinedAtMs: bigint("joined_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.coupId, table.joinerKey] }),
    check("governance_coup_sides_side", sql`${table.side} in ('rebel', 'government')`),
  ],
);

/**
 * 나라 화폐 정책 단계(줄기 governance-5 — 질문 2453, D-252 "발행·소각과 화폐 체제는 지도자 몫"·D-131 중앙은행 공식): 나라마다 한 줄, 줄이 없으면 공식(테일러 준칙 — 지금과 같다).
 * mode = formula(공식) | manual(지도자가 하루 조절량을 정함 [임시]). rate_bp = manual일 때 하루 조절(시중 통화량의 만분율, +발행 −소각 — 설정 칸 하루 상한 안).
 * 단계 바꾸기는 안건(민주주의·자본주의 — 문턱 gov_threshold_currency_pm) 또는 독재 직권, 같은 단계 안의 조절량은 지도자가 바로 정한다.
 */
export const nationMonetary = pgTable(
  "nation_monetary",
  {
    nationId: bigint("nation_id", { mode: "number" })
      .primaryKey()
      .references(() => factions.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    rateBp: integer("rate_bp").notNull().default(0),
    /**
     * 목표 물가 상한(천분율 — 줄기 gov-coup, D-588 2499 · D-131): 물가 지수가 이 값 이상이면 손 조절 발행을 막는다(소각은 그대로). null = 설정 칸 출발값
     * gov_monetary_cap_milli. 지도자가 설정 칸 범위 안에서 정한다
     */
    priceCapMilli: integer("price_cap_milli"),
    setAtMs: bigint("set_at_ms", { mode: "number" }).notNull(),
    setBy: uuid("set_by"),
  },
  (table) => [
    check("nation_monetary_mode", sql`${table.mode} in ('formula', 'manual')`),
    check("nation_monetary_rate", sql`${table.rateBp} between -10000 and 10000`),
    check(
      "nation_monetary_cap",
      sql`${table.priceCapMilli} is null or ${table.priceCapMilli} between 1 and 1000000`,
    ),
  ],
);

/**
 * 지도자 신임도(줄기 governance-5 — 사용자 답 D-585, governance/approval.ts): 나라마다 지금 지배 가문의 신임도(0~1000) 한 줄. 지배 가문이 바뀌면 시작값으로 다시 적는다.
 * 바뀜(줄기 gov-coup — D-588 2493 "알아서"): 오르내림(governance/approvalFactors.ts)이 지난 틱에 본 값을 칸 넷에 남긴다 — 세금 수준(‰)·도시 수·전쟁 수·마지막 하루 셈 시각.
 * null = 아직 보지 않음(처음 보는 틱은 기준만 적고 바꾸지 않는다)
 */
export const governanceApproval = pgTable(
  "governance_approval",
  {
    nationId: bigint("nation_id", { mode: "number" })
      .primaryKey()
      .references(() => factions.id, { onDelete: "cascade" }),
    houseKey: text("house_key"),
    approval: integer("approval").notNull(),
    taxLevelPm: integer("tax_level_pm"),
    cities: integer("cities"),
    wars: integer("wars"),
    dayAtMs: bigint("day_at_ms", { mode: "number" }),
    setAtMs: bigint("set_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [check("governance_approval_range", sql`${table.approval} between 0 and 1000`)],
);
