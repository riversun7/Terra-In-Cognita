// 가문 창설을 앱에 잇는다(app.ts가 부른다 — 그 파일을 키우지 않으려고 여기서 묶는다). docs/adr/2026-11-11-faction-identity.md "바뀜 (926~935 답)".
// - 게이트웨이(WebSocket house_found): DB가 있으면 선다. 시민권(사이보그 나라)은 세계가 준비됐으면 월드 사이보그 기록, 아니면 DB에서 읽는다.
//   창설은 무료다(기획 D-565 — 옛 창설 비용·국고 이체를 지웠다).
// - 서버를 켤 때 옛 정체성(가문 없는 줄)을 한 번 가문으로 옮긴다(found.ts adoptUnfoundedIdentities, 뒤에서 — 실패해도 서버는 뜬다).
// - 가문 가입(질문 985 다, members.ts)·소속 도시 바꾸기(D-565, houseHome.ts)도 같은 게이트웨이가 받는다. 귀화해도 가문은 따라가지 않는다
//   (D-565 — 가문 나라는 소속 도시가 정한다. 옛 983 가 follow.ts를 지웠다).
import type { Database } from "../db/client.ts";
import type { NationPreset } from "../npc/nations.ts";
import type { World } from "../world/world.ts";
import { adoptUnfoundedIdentities, createHouseFounder, nationFromDb } from "./found.ts";
import { type HouseGateway, createHouseGateway } from "./gateway.ts";
import { type HouseCityService, createHouseCity } from "./houseCity.ts";
import { createHouseHome } from "./houseHome.ts";
import { createHouseRecruitService } from "./houseRecruit.ts";
import { createHouseMembers } from "./members.ts";
import { createHouseSuccession } from "./succession.ts";
import { houseTiesOf } from "../world/houseTies.ts";
import type { HouseRules } from "./rules.ts";

type HouseWorld = Pick<World, "status" | "persistence" | "npc" | "maps">;

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
  const home = createHouseHome({
    pool,
    db: options.db,
    rules: options.rules,
    now: options.now,
    presets: options.presets,
  });
  const gateway = createHouseGateway({
    founder: () =>
      createHouseFounder({ pool, db: options.db, now: options.now, nationOf, presets: options.presets }),
    members: () =>
      createHouseMembers({ pool, db: options.db, rules: options.rules, now: options.now, nationOf }),
    succession: () => succession,
    city: () => city,
    recruit: () => recruit,
    home: () => home,
    afterMembership: async () => {
      await houseTiesOf(options.world?.persistence)?.reload();
    },
    now: options.now,
    log: options.log,
  });
  return { gateway, city };
}
