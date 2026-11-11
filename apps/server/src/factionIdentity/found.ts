// 가문 창설(WebSocket house_found, 프로토콜 22) — 질문 926 나(기획 정리 D-529 포인터): 세력 정체성을 정하는 것이 곧 가문 창설이다. 세력 행
// (kind = player)을 만들고 창설자는 자기 NPC 국가의 시민으로 남는다(D-216 이중 소속). 비용은 설정 칸 house_found_cost(출발값 0).
// docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 926~935 답)".
// - 차례: 시민권(사이보그) → 저장한 정체성 → 이미 가문 → 기기가 본 비용 = 지금 비용 → 잔고 → 창설(한 문장, house.ts) → 값 받기(원장) → 감사 기록.
//   창설 문장이 실패하면(약어 겹침) 값을 받지 않는다. 값은 창설 뒤에 받는다: 원장은 메모리 원장이라 실패하지 않고(잔고는 앞에서 봤다,
//   한 연결의 명령은 차례로 처리한다) 저장은 월드 쓰기 대기열이 한다.
// - 값은 창설자 나라 국고로 간다([임시] — 가문을 그 나라에 등록하는 값으로 읽었다, 질문 981).
// - 도시를 얻을 때 봉신·독립을 고르는 길(D-216·D-340)은 houseCity.ts(마을 세우기·폐허 고르기, 질문 1005 가)다.
import type { HouseResultCode } from "@terra/protocol";
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { foundHouse, houseOfUser, unfoundedIdentities } from "./house.ts";
import type { HouseRules } from "./rules.ts";
import { type IdentityQueryable, loadIdentity } from "./store.ts";

export type HouseFoundResult =
  | { readonly ok: true; readonly factionId: number; readonly paid: string }
  | { readonly ok: false; readonly code: HouseResultCode };

/** 창설자의 지갑(월드 원장). 없는 서버(시험)는 비용이 0일 때만 창설한다 */
export interface HouseWallet {
  balance(userId: string): bigint;
  /** 창설자 → 그 나라 국고. 받았으면 true(주체·국고가 없으면 false) */
  pay(userId: string, nationId: number, amount: bigint, atMs: number): boolean;
  /** 원장 쓰기가 DB에 닿을 때까지 */
  durable(): Promise<void>;
}

export interface HouseFounderOptions {
  readonly pool: IdentityQueryable;
  readonly db?: Database | undefined;
  readonly rules: () => HouseRules;
  readonly now: () => number;
  /** 사용자의 나라(사이보그 시민권, cyborgs.faction_id). 사이보그가 없으면 undefined */
  readonly nationOf: (userId: string) => number | undefined | Promise<number | undefined>;
  readonly wallet?: HouseWallet | undefined;
}

export interface HouseFounder {
  found(userId: string, input: { readonly cost: string }): Promise<HouseFoundResult>;
}

const fail = (code: HouseResultCode): HouseFoundResult => ({ ok: false, code });

const isShortViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  Reflect.get(error, "code") === "23505" &&
  String(Reflect.get(error, "constraint") ?? "").includes("short");

/** DB에서 사용자의 나라를 읽는다(월드가 없는 서버·시험) */
export async function nationFromDb(pool: IdentityQueryable, userId: string): Promise<number | undefined> {
  const { rows } = await pool.query<{ faction_id: string }>(
    "select faction_id from cyborgs where user_id = $1",
    [userId],
  );
  return rows[0] ? Number(rows[0].faction_id) : undefined;
}

export function createHouseFounder(o: HouseFounderOptions): HouseFounder {
  return {
    async found(userId, input) {
      const nationId = await o.nationOf(userId);
      if (nationId === undefined) return fail("no_cyborg");
      const identity = await loadIdentity(o.pool, userId);
      if (!identity) return fail("no_identity");
      // 이미 가문이 있다: 창설했거나 다른 가문의 가문원이다(질문 985 — 사용자마다 한 가문)
      if (identity.factionId !== null || (await houseOfUser(o.pool, userId)) !== null)
        return fail("already_founded");
      const cost = o.rules().foundCost;
      if (input.cost !== cost.toString()) return fail("terms_changed");
      if (cost > 0n && (!o.wallet || o.wallet.balance(userId) < cost)) return fail("insufficient_funds");
      const at = o.now();
      let factionId: number | null;
      try {
        factionId = await foundHouse(o.pool, { userId, nationId, nowMs: at });
      } catch (error) {
        if (isShortViolation(error)) return fail("short_taken");
        throw error;
      }
      // 그 사이 다른 연결이 창설했다
      if (factionId === null) return fail("already_founded");
      let paid = 0n;
      if (cost > 0n && o.wallet?.pay(userId, nationId, cost, at)) {
        paid = cost;
        await o.wallet.durable();
      }
      if (o.db)
        await writeAudit(o.db, {
          actor: { kind: "user", id: userId, ip: null },
          action: "faction.house_found",
          targetId: userId,
          before: null,
          after: {
            factionId,
            nationId,
            name: identity.name,
            shortName: identity.shortName,
            paid: String(paid),
          },
        });
      return { ok: true, factionId, paid: String(paid) };
    },
  };
}

/**
 * 옛 정체성(계정 열쇠로 저장만 하고 가문이 없는 줄)을 가문으로 옮긴다 — 서버를 켤 때 한 번(질문 926 나 "정체성 = 가문 창설"이 되기 전에
 * 정한 것). 값은 받지 않는다. 사이보그(나라)가 없는 계정은 그대로 둔다(창설 화면에서 마친다). 약어가 다른 세력과 겹치면 건너뛴다(그 계정이
 * 정체성을 고친 뒤 창설한다). 옮긴 수
 */
export async function adoptUnfoundedIdentities(
  pool: IdentityQueryable,
  options: {
    readonly now: () => number;
    readonly log?: { warn(obj: object, message: string): void } | undefined;
  },
): Promise<number> {
  let adopted = 0;
  for (const row of await unfoundedIdentities(pool)) {
    try {
      if (
        (await foundHouse(pool, { userId: row.userId, nationId: row.nationId, nowMs: options.now() })) !==
        null
      )
        adopted += 1;
    } catch (error) {
      if (!isShortViolation(error)) throw error;
      options.log?.warn({ userId: row.userId }, "faction identity: short name taken, house not founded");
    }
  }
  return adopted;
}
