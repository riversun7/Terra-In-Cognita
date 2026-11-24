// 가문 창설(WebSocket house_found, 프로토콜 22) — ADR 2026-11-24-house-membership-separation.md:
// - 가문 창설은 도시·국가 가입과 별개다. 창설 화면에서 도시를 고르지 않으며, 창설 직후 가문은 도시·국가 미소속(born_of = null, house_homes 없음)으로 시작한다.
// - 창설은 무료다(D-565). 기기가 보내는 cost·cityId는 옛 기기 호환으로 메시지에 남고 서버는 보지 않는다.
// - 차례: 사이보그 존재 → 저장한 정체성 → 이미 가문 → 창설(한 문장, house.ts) → 감사 기록.
// - 도시·국가 가입은 창설 뒤 별도 과정(houseHome.ts)으로 진행한다.
import type { HouseResultCode } from "@terra/protocol";
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import type { NationPreset } from "../npc/nations.ts";
import { foundHouse, houseOfUser, unfoundedIdentities } from "./house.ts";
import { type IdentityQueryable, loadIdentity } from "./store.ts";

export type HouseFoundResult =
  | { readonly ok: true; readonly factionId: number; readonly paid: string }
  | { readonly ok: false; readonly code: HouseResultCode };

export interface HouseFounderOptions {
  readonly pool: IdentityQueryable;
  readonly db?: Database | undefined;
  readonly now: () => number;
  /** 사용자의 나라(사이보그 시민권, cyborgs.faction_id). 사이보그가 없으면 undefined, 국가 미소속이면 null */
  readonly nationOf: (userId: string) => number | null | undefined | Promise<number | null | undefined>;
  /** 나라 이름(호환용 선택 인자) */
  readonly presets?: (() => readonly NationPreset[]) | undefined;
}

export interface HouseFounder {
  found(
    userId: string,
    input: { readonly cost: string; readonly cityId?: number | undefined },
  ): Promise<HouseFoundResult>;
}

const fail = (code: HouseResultCode): HouseFoundResult => ({ ok: false, code });

const isShortViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  Reflect.get(error, "code") === "23505" &&
  String(Reflect.get(error, "constraint") ?? "").includes("short");

/** DB에서 사용자의 나라를 읽는다(월드가 없는 서버·시험). 사이보그가 없으면 undefined, 국가 미소속이면 null */
export async function nationFromDb(
  pool: IdentityQueryable,
  userId: string,
): Promise<number | null | undefined> {
  const { rows } = await pool.query<{ faction_id: string | null }>(
    "select faction_id from cyborgs where user_id = $1",
    [userId],
  );
  if (!rows[0]) return undefined;
  return rows[0].faction_id === null ? null : Number(rows[0].faction_id);
}

export function createHouseFounder(o: HouseFounderOptions): HouseFounder {
  return {
    async found(userId, _input) {
      const citizenship = await o.nationOf(userId);
      if (citizenship === undefined) return fail("no_cyborg");
      const identity = await loadIdentity(o.pool, userId);
      if (!identity) return fail("no_identity");
      // 이미 가문이 있다: 창설했거나 다른 가문의 가문원이다(질문 985 — 사용자마다 한 가문)
      if (identity.factionId !== null || (await houseOfUser(o.pool, userId)) !== null)
        return fail("already_founded");
      // 가문 창설은 도시·국가 가입과 별개다(ADR 2026-11-24-house-membership-separation.md): 미소속 가문으로 창설한다
      const at = o.now();
      let factionId: number | null;
      try {
        factionId = await foundHouse(o.pool, { userId, nationId: null, homeCityId: null, nowMs: at });
      } catch (error) {
        if (isShortViolation(error)) return fail("short_taken");
        throw error;
      }
      // 그 사이 다른 연결이 창설했다
      if (factionId === null) return fail("already_founded");
      if (o.db)
        await writeAudit(o.db, {
          actor: { kind: "user", id: userId, ip: null },
          action: "faction.house_found",
          targetId: userId,
          before: null,
          after: {
            factionId,
            nationId: null,
            homeCityId: null,
            name: identity.name,
            shortName: identity.shortName,
            paid: "0",
          },
        });
      return { ok: true, factionId, paid: "0" };
    },
  };
}

/**
 * 옛 정체성(계정 열쇠로 저장만 하고 가문이 없는 줄)을 가문으로 옮긴다 — 서버를 켤 때 한 번.
 * 가문 창설은 도시·국가 미소속으로 옮긴다(ADR 2026-11-24-house-membership-separation.md). 옮긴 수
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
        (await foundHouse(pool, {
          userId: row.userId,
          nationId: null,
          homeCityId: null,
          nowMs: options.now(),
        })) !== null
      )
        adopted += 1;
    } catch (error) {
      if (!isShortViolation(error)) throw error;
      options.log?.warn({ userId: row.userId }, "faction identity: short name taken, house not founded");
    }
  }
  return adopted;
}
