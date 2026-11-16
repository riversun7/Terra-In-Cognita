// 가문 창설을 앱에 잇는다(app.ts가 부른다 — 그 파일을 키우지 않으려고 여기서 묶는다). docs/adr/2026-11-11-faction-identity.md "바뀜 (926~935 답)".
// - 게이트웨이(WebSocket house_found): DB가 있으면 선다. 시민권(사이보그 나라)은 세계가 준비됐으면 월드 사이보그 기록, 아니면 DB에서 읽는다.
//   창설은 무료다(기획 D-565 — 옛 창설 비용·국고 이체를 지웠다).
// - 서버를 켤 때 옛 정체성(가문 없는 줄)을 한 번 가문으로 옮긴다(found.ts adoptUnfoundedIdentities, 뒤에서 — 실패해도 서버는 뜬다).
// - 공고한 소속 도시 옮기기(D-570, houseMoves.ts)는 1분 타이머가 한다.
// - 가문 가입(질문 985 다, members.ts)·소속 도시 바꾸기(D-565, houseHome.ts)도 같은 게이트웨이가 받는다. 명령 뒤 가문 표를 다시 읽어
//   가문원 시민권·내 도시를 가문 소속 도시에 맞춘다(D-569 "나라는 하나", world/houseTies.ts). 가문원은 귀화하지 못한다(citizenship in_house).
import type { Database } from "../db/client.ts";
import type { NationPreset } from "../npc/nations.ts";
import type { World } from "../world/world.ts";
import { adoptUnfoundedIdentities, createHouseFounder, nationFromDb } from "./found.ts";
import { type HouseGateway, createHouseGateway } from "./gateway.ts";
import { type HouseCityService, createHouseCity } from "./houseCity.ts";
import { createHouseEntryPolicy } from "./houseEntryPolicy.ts";
import { createHouseHome } from "./houseHome.ts";
import { createHouseMoves } from "./houseMoves.ts";
import { createHousePolicy } from "./housePolicy.ts";
import { attachHouseTax, houseTaxerOf } from "./houseTax.ts";
import { createHouseRecruitService } from "./houseRecruit.ts";
import { createHouseMembers } from "./members.ts";
import { createHouseSuccession } from "./succession.ts";
import { houseTiesOf } from "../world/houseTies.ts";
import type { HouseRules } from "./rules.ts";

type HouseWorld = Pick<World, "status" | "persistence" | "npc" | "maps">;

/** 공고한 소속 도시를 옮기는 간격(D-570) */
const MOVE_SWEEP_MS = 60_000;

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
  gateway: HouseGateway;
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
  // 가문세 표(houseTax.ts — 배당·임금이 원장으로 찾는다): 세계가 준비되면 원장에 붙이고 세율을 읽는다(5초마다 보고, 붙으면 멈춘다)
  const taxTimer = setInterval(() => {
    const p = options.world?.status().state === "ready" ? options.world.persistence : undefined;
    if (!p) return;
    clearInterval(taxTimer);
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
    afterMembership: async () => {
      await houseTiesOf(options.world?.persistence)?.reload();
    },
    now: options.now,
    log: options.log,
  });
  return {
    gateway,
    city,
    stop: () => {
      clearInterval(moveTimer);
      clearInterval(taxTimer);
    },
  };
}
