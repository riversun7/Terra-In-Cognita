// 가문 창설을 앱에 잇는다(app.ts가 부른다 — 그 파일을 키우지 않으려고 여기서 묶는다). docs/adr/2026-11-11-faction-identity.md "바뀜 (926~935 답)".
// - 게이트웨이(WebSocket house_found): DB가 있으면 선다. 시민권(사이보그 나라)은 세계가 준비됐으면 월드 사이보그 기록, 아니면 DB에서 읽는다.
//   창설은 무료다(기획 D-565 — 옛 창설 비용·국고 이체를 지웠다).
// - 서버를 켤 때 옛 정체성(가문 없는 줄)을 한 번 가문으로 옮긴다(found.ts adoptUnfoundedIdentities, 뒤에서 — 실패해도 서버는 뜬다).
// - 공고한 소속 도시 옮기기(D-570, houseMoves.ts)는 1분 타이머가 한다.
// - 세계가 준비되면 옛 도시 연맹 기금을 낸 가문 금고로 한 번 되돌린다(질문 2505 나, leagueRefund.ts). 연맹 조항 카드 집행 고리도 그때 붙인다(league-2).
// - 가문 가입(질문 985 다, members.ts)·소속 도시 바꾸기(D-565, houseHome.ts)도 같은 게이트웨이가 받는다. 명령 뒤 가문 표를 다시 읽어
//   가문원 시민권·내 도시를 가문 소속 도시에 맞춘다(D-569 "나라는 하나", world/houseTies.ts). 가문원은 귀화하지 못한다(citizenship in_house).
import type { Database } from "../db/client.ts";
import type { NationPreset } from "../npc/nations.ts";
import type { World } from "../world/world.ts";
import { adoptUnfoundedIdentities, createHouseFounder, nationFromDb } from "./found.ts";
import { createHouseGateway } from "./gateway.ts";
import { type HouseCityService, createHouseCity } from "./houseCity.ts";
import { createHouseEntryPolicy } from "./houseEntryPolicy.ts";
import { createHouseHome } from "./houseHome.ts";
import { createHouseMoves } from "./houseMoves.ts";
import { createHousePolicy } from "./housePolicy.ts";
import { attachHouseTax, houseTaxerOf } from "./houseTax.ts";
import { createHouseRecruitService } from "./houseRecruit.ts";
import { refundOldLeagueFunds } from "./leagueRefund.ts";
import { type HouseLeagueGateway, createHouseLeagueSocket, withLeagues } from "./leagueGateway.ts";
import { type HouseLeagueService, type NpcLeagueHouse, createHouseLeagueService } from "./leagueService.ts";
import { attachHouseExpel } from "./houseExpel.ts";
import { createHouseMembers } from "./members.ts";
import { createHouseSuccession } from "./succession.ts";
import { houseTiesOf } from "../world/houseTies.ts";
import { attachNationTaxes, nationTaxesOf } from "../government/nationTax.ts";
import { applyNationTaxes, createNationTaxPolicy } from "../government/nationTaxPolicy.ts";
import type { HouseRules } from "./rules.ts";
import { type GovernanceAttached, attachGovernance } from "../governance/attach.ts";
import { withGovernance } from "../governance/gateway.ts";
import { type CitySharesAttached, attachCityShares } from "../cityShares/attach.ts";
import { type DiplomacyAttached, attachDiplomacy } from "../diplomacy/attach.ts";

type HouseWorld = Pick<World, "status" | "persistence" | "npc" | "maps">;

/** 공고한 소속 도시를 옮기는 간격(D-570) */
const MOVE_SWEEP_MS = 60_000;
/** NPC 가문 연맹 판단 간격(npc-invest-2 — leagueService.ts npcSweep) [임시] */
const LEAGUE_SWEEP_MS = 3_600_000;

export function attachHouses(options: {
  readonly db: Database;
  readonly world: HouseWorld | undefined;
  readonly rules: () => HouseRules;
  readonly now: () => number;
  /** 실효 국가 프리셋(소속 도시의 나라 이름) */
  readonly presets?: (() => readonly NationPreset[]) | undefined;
  readonly log: {
    info(obj: object, message: string): void;
    warn(obj: object, message: string): void;
    error(obj: object, message: string): void;
  };
}): {
  /** 가문 + 나라 의결(gov_*) + 도시 지분(city_share_*) + 조약(dip_*) + 가문 연맹(house_league) 소켓(docs/adr/2026-11-21-governance.md·share-market.md·diplomacy-treaties.md) */
  gateway: HouseLeagueGateway;
  /** 가문 연맹(조약) 서비스(npc-invest-2 — leagueService.ts) */
  leagues: HouseLeagueService;
  /** 나라 의결 서비스·조회 */
  governance: GovernanceAttached;
  /** 도시(정부) 지분 시장 서비스·조회(D-583 — cityShares/attach.ts) */
  cityShares: CitySharesAttached;
  /** 지도자끼리 조약 서비스·조회(D-588 — diplomacy/attach.ts) */
  diplomacy: DiplomacyAttached;
  /** 가문 도시(조회 — 세력 화면 "내 가문" 칸) */
  city: HouseCityService;
  /** 공고 옮기기 타이머를 멈춘다(앱을 닫을 때) */
  stop(): void;
} {
  const pool = options.db.$client;
  /** 사용자의 나라: 세계가 준비됐으면 월드 사이보그 기록, 아니면 DB */
  const nationOf = (userId: string): number | undefined | Promise<number | undefined> => {
    const world = options.world;
    const cyborgs = world?.status().state === "ready" ? world.persistence?.cyborgs : undefined;
    return cyborgs?.record(userId)?.factionId ?? nationFromDb(pool, userId);
  };
  void (async () => {
    const adopted = await adoptUnfoundedIdentities(pool, { now: options.now, log: options.log });
    if (adopted > 0) options.log.info({ adopted }, "faction identity: houses founded from saved identities");
  })().catch((error: unknown) =>
    options.log.error({ err: error }, "faction identity: adopting saved identities failed"),
  );
  const succession = createHouseSuccession({ pool, db: options.db, now: options.now });
  const city = createHouseCity({
    pool,
    db: options.db,
    rules: options.rules,
    now: options.now,
    world: () => options.world,
  });
  const recruit = createHouseRecruitService({
    pool,
    db: options.db,
    now: options.now,
    world: () => options.world,
  });
  const persistence = () => options.world?.persistence;
  const home = createHouseHome({
    pool,
    db: options.db,
    rules: options.rules,
    now: options.now,
    presets: options.presets,
    persistence,
  });
  // 가문 이동 정책 정하기(질문 2018 답, houseEntryPolicy.ts — 도시 주인·독립 나라 가문장)
  const entryPolicy = createHouseEntryPolicy({ pool, db: options.db, now: options.now });
  // 공고한 소속 도시 옮기기(D-570, houseMoves.ts): 1분마다 시각이 지난 공고를 옮긴다(세계가 준비된 뒤 — 가입비·지원금 원장)
  const moves = createHouseMoves({
    pool,
    db: options.db,
    now: options.now,
    rules: options.rules,
    presets: options.presets,
    persistence,
  });
  // 가문 금고 기부·가문세율·도시 짓기 정책(D-574 2150·2124, housePolicy.ts)
  const policy = createHousePolicy({
    pool,
    db: options.db,
    rules: options.rules,
    now: options.now,
    persistence,
  });
  const taxTable = () => {
    const ledger = options.world?.persistence?.ledger;
    return ledger ? nationTaxesOf(ledger) : undefined;
  };
  // 나라 의결(아래에서 선다 — 세율 안건을 열고 가결되면 쓴다, 질문 2407 가)
  let governanceRef: GovernanceAttached | undefined;
  const nationTax = createNationTaxPolicy({
    pool,
    db: options.db,
    now: options.now,
    table: taxTable,
    agendaWidthPm: () => options.rules().governance.taxAgendaWidthPm,
    openAgenda: async (userId, row) => {
      const result = await governanceRef?.service.propose(userId, { kind: "tax_change", taxes: row });
      if (!result) return { ok: false, code: "busy" };
      if (result.ok) return { ok: true, agendaId: result.agendaId };
      return {
        ok: false,
        code: result.code === "busy" || result.code === "internal_error" ? result.code : "not_leader",
      };
    },
  });
  // 가문세 표(houseTax.ts — 배당·임금이 원장으로 찾는다): 세계가 준비되면 원장에 붙이고 세율을 읽는다(5초마다 보고, 붙으면 멈춘다)
  const taxTimer = setInterval(() => {
    const p = options.world?.status().state === "ready" ? options.world.persistence : undefined;
    if (!p) return;
    clearInterval(taxTimer);
    // 같은 가문원을 친 사람 추방(D-592 2581 (4) [임시 — houseExpel.ts]): 일부러 치기가 세계 저장 층에서 찾는다
    attachHouseExpel(p, {
      expel: (userId, reason) =>
        createHouseMembers({ pool, db: options.db, rules: options.rules, now: options.now, nationOf }).expel(
          userId,
          reason,
        ),
      after: async () => {
        await houseTiesOf(p)?.reload();
      },
    });
    // 옛 도시 연맹 기금을 낸 가문 금고로 되돌린다(질문 2505 나 — leagueRefund.ts, 한 번·멱등)
    refundOldLeagueFunds(pool, p.ledger, options.now())
      .then((report) => {
        if (report.funds > 0 || report.unattributed > 0)
          options.log.info({ ...report, amount: report.amount.toString() }, "old league funds refunded");
      })
      .catch((error: unknown) => options.log.error({ err: error }, "old league fund refund failed"));
    // 나라 세금 표(질문 2322 나·2373 가 — government/nationTax.ts): 사업장 소득세·하루 끝 주민세가 원장으로 찾는다
    if (!nationTaxesOf(p.ledger))
      attachNationTaxes({ pool, ledger: p.ledger, owners: p.owners })
        .reload()
        .catch((error: unknown) => options.log.error({ err: error }, "nation tax rates load failed"));
    if (houseTaxerOf(p.ledger)) return;
    const taxer = attachHouseTax({
      pool,
      ledger: p.ledger,
      owners: p.owners,
      ties: () => houseTiesOf(p),
      maxPm: () => options.rules().taxMaxPm,
    });
    taxer
      .reload()
      .catch((error: unknown) => options.log.error({ err: error }, "house tax rates load failed"));
  }, 5_000);
  taxTimer.unref();
  const moveTimer = setInterval(() => {
    if (options.world?.status().state !== "ready") return;
    moves.applyDue().catch((error: unknown) => options.log.error({ err: error }, "house moves failed"));
  }, MOVE_SWEEP_MS);
  moveTimer.unref();
  const gateway = createHouseGateway({
    founder: () =>
      createHouseFounder({ pool, db: options.db, now: options.now, nationOf, presets: options.presets }),
    members: () =>
      createHouseMembers({ pool, db: options.db, rules: options.rules, now: options.now, nationOf }),
    succession: () => succession,
    city: () => city,
    recruit: () => recruit,
    home: () => home,
    entryPolicy: () => entryPolicy,
    policy: () => policy,
    // 나라 세금 정하기(독립 나라 가문장 — government/nationTaxPolicy.ts). 메모리 표는 세계가 준비된 뒤 붙는다
    nationTax: () => nationTax,
    afterMembership: async () => {
      await houseTiesOf(options.world?.persistence)?.reload();
    },
    now: options.now,
    log: options.log,
  });
  // 도시(정부) 지분 시장(D-583 — cityShares/attach.ts): 의결이 승인한 국고 지분 팔기를 받고 같은 소켓으로 주문을 받는다
  let sharesRef: CitySharesAttached | undefined;
  let diplomacyRef: DiplomacyAttached | undefined;
  // 나라 의결(안건·투표·선출·체제 전환 — governance/attach.ts): 같은 소켓으로 받고 1분 틱을 돈다
  const governance = attachGovernance({
    db: options.db,
    world: () => options.world,
    rules: () => options.rules().governance,
    presets: options.presets,
    now: options.now,
    log: options.log,
    applyTaxes: async (nationRow, taxes, nowMs) => {
      await applyNationTaxes(pool, taxTable(), nationRow, taxes, nowMs, null);
      return true;
    },
    // 승인된 국고 지분 팔기(질문 2438 답 D-583) → 도시 지분 시장에 국고 팔 주문
    approvedShareSale: async (sale, nowMs) => {
      await sharesRef?.service.approvedSale(sale, nowMs);
    },
    // 국고 지분 사기(D-587 질문 2479 나) → 도시 지분 시장에 국고 사기 주문
    approvedShareBuy: async (buy, nowMs) => {
      await sharesRef?.service.approvedBuy(buy, nowMs);
    },
    shareBuyCheck: (nation, cityId, count, maxPrice) =>
      sharesRef ? sharesRef.service.buyCheck(nation, cityId, count, maxPrice) : "busy",
    // 지도자끼리 조약(D-588): 조약 비준 집행·강화 제안 고리와 의결 틱 뒤 틱
    diplomacy: () =>
      diplomacyRef && {
        hooks: diplomacyRef.service.hooks,
        tick: () => diplomacyRef?.service.tick() ?? Promise.resolve(),
      },
  });
  governanceRef = governance;
  const cityShares = attachCityShares({
    world: () => options.world,
    governance: () => governance,
    rules: () => options.rules().cityShares,
    presets: options.presets,
    now: options.now,
    log: options.log,
  });
  sharesRef = cityShares;
  const diplomacy = attachDiplomacy({
    db: options.db,
    world: () => options.world,
    governance,
    presets: options.presets,
    now: options.now,
    log: options.log,
  });
  diplomacyRef = diplomacy;
  // 가문 연맹(조약 — npc-invest-2, 질문 2502·2503): 플레이어 명령은 같은 소켓, NPC 가문 판단은 한 시간마다(세계가 준비된 뒤 — npc-fix-3: 사라진 가문 빼기·
  // NPC 나가기·표도 같은 때)
  const leagues = createHouseLeagueService({
    pool,
    now: options.now,
    voteRules: () => options.rules().leagueVote,
  });
  const leagueSocket = createHouseLeagueSocket({
    service: () => leagues,
    now: options.now,
    log: options.log,
  });
  // npc-fix-3(2568): NPC 런타임이 없어도(세계는 준비됨) 해산한 플레이어 가문은 뺀다 — 그때는 NPC 가문을 빼지 않는다(모르므로)
  const leagueTimer = setInterval(() => {
    const world = options.world;
    if (world?.status().state !== "ready") return;
    const npc = world.npc;
    const houses: NpcLeagueHouse[] = [];
    const liveNpcHouses = npc ? new Set<number>() : undefined;
    if (npc)
      for (const place of npc.world.cities.values())
        for (const houseId of npc.cityHouses.housesOfCity(place.id)) {
          liveNpcHouses?.add(houseId);
          const head = npc.cityHouses.headOf(houseId);
          const traits = head === undefined ? undefined : npc.unitTraits(head);
          if (traits) houses.push({ houseId, traits });
        }
    leagues
      .npcSweep({ houses, liveNpcHouses }, options.rules().npcLeague)
      .catch((error: unknown) => options.log.error({ err: error }, "npc house leagues failed"));
  }, LEAGUE_SWEEP_MS);
  leagueTimer.unref();
  return {
    gateway: withLeagues(
      diplomacy.wrap(cityShares.wrap(withGovernance(gateway, governance.gateway))),
      leagueSocket,
    ),
    leagues,
    governance,
    cityShares,
    diplomacy,
    city,
    stop: () => {
      clearInterval(moveTimer);
      clearInterval(taxTimer);
      clearInterval(leagueTimer);
      governance.stop();
      cityShares.stop();
    },
  };
}
