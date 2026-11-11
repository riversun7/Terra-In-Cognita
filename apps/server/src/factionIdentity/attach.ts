// 가문 창설을 앱에 잇는다(app.ts가 부른다 — 그 파일을 키우지 않으려고 여기서 묶는다). docs/adr/2026-11-11-faction-identity.md "바뀜 (926~935 답)".
// - 게이트웨이(WebSocket house_found): DB가 있으면 선다. 시민권(사이보그 나라)은 세계가 준비됐으면 월드 사이보그 기록, 아니면 DB에서 읽는다.
//   값(창설 비용)은 월드 원장으로 받는다(창설자 → 창설자 나라 국고). 세계가 없으면 비용이 0일 때만 창설한다.
// - 서버를 켤 때 옛 정체성(가문 없는 줄)을 한 번 가문으로 옮긴다(found.ts adoptUnfoundedIdentities, 뒤에서 — 실패해도 서버는 뜬다).
import type { Database } from "../db/client.ts";
import type { World } from "../world/world.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import { type HouseWallet, adoptUnfoundedIdentities, createHouseFounder, nationFromDb } from "./found.ts";
import { type HouseGateway, createHouseGateway } from "./gateway.ts";
import type { HouseRules } from "./rules.ts";

type HouseWorld = Pick<World, "status" | "persistence">;

/** 월드 원장 지갑(세계가 준비됐을 때만) */
function walletOf(world: HouseWorld | undefined): HouseWallet | undefined {
  if (!world || world.status().state !== "ready") return undefined;
  const p = world.persistence;
  if (!p) return undefined;
  const treasuryOf = (nationId: number): number | undefined => {
    for (const owner of p.owners.values()) if (owner.factionId === nationId) return owner.id;
    return undefined;
  };
  return {
    balance: (userId) => {
      const ownerId = p.settlement.findOwnerOfUser(userId);
      return ownerId === undefined ? 0n : p.ledger.balanceOf(ownerId, ASSET_CREDIT);
    },
    pay(userId, nationId, amount, atMs) {
      const ownerId = p.settlement.findOwnerOfUser(userId);
      const treasury = treasuryOf(nationId);
      if (ownerId === undefined || treasury === undefined || amount <= 0n) return false;
      p.ledger.post({
        kind: "house_found",
        atMs,
        key: `house_found:${userId}`,
        entries: [
          { account: p.ledger.ownerAccount(ownerId, ASSET_CREDIT), amount: -amount },
          { account: p.ledger.ownerAccount(treasury, ASSET_CREDIT), amount },
        ],
      });
      return true;
    },
    durable: () => p.writer.durable(),
  };
}

export function attachHouses(options: {
  readonly db: Database;
  readonly world: HouseWorld | undefined;
  readonly rules: () => HouseRules;
  readonly now: () => number;
  readonly log: {
    info(obj: object, message: string): void;
    warn(obj: object, message: string): void;
    error(obj: object, message: string): void;
  };
}): HouseGateway {
  const pool = options.db.$client;
  void adoptUnfoundedIdentities(pool, { now: options.now, log: options.log }).then(
    (adopted) => {
      if (adopted > 0)
        options.log.info({ adopted }, "faction identity: houses founded from saved identities");
    },
    (error: unknown) =>
      options.log.error({ err: error }, "faction identity: adopting saved identities failed"),
  );
  return createHouseGateway({
    founder: () => {
      const world = options.world;
      const cyborgs = world?.status().state === "ready" ? world.persistence?.cyborgs : undefined;
      return createHouseFounder({
        pool,
        db: options.db,
        rules: options.rules,
        now: options.now,
        nationOf: (userId) => cyborgs?.record(userId)?.factionId ?? nationFromDb(pool, userId),
        wallet: walletOf(world),
      });
    },
    now: options.now,
    log: options.log,
  });
}
