// 가문 창설(WebSocket house_found, 프로토콜 22) — 질문 926 나(기획 정리 D-529 포인터): 세력 정체성을 정하는 것이 곧 가문 창설이다. 세력 행
// (kind = player)을 만든다. 나라는 하나(D-569): 창설자의 시민권·내 도시는 고른 소속 도시와 그 나라로 맞춘다(world/houseTies.ts).
// docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 926~935 답)"·"바뀜 (2026-11-15, D-565)".
// - 기획 D-565: 창설은 무료다(옛 설정 칸 house_found_cost·창설자 나라 국고로 내던 값 — 질문 981 — 을 대신함). 가문은 소속 도시를 고르고
//   그 도시가 속한 나라의 가문이 된다(가문 나라 born_of = 그 도시의 나라, houseHome.ts). 소속 도시를 보내지 않으면(38판 기기) 창설자 사이보그의
//   내 도시. 그 도시가 사라졌으면(폐허) 창설자 시민권 나라로 둔다(가문장이 나중에 고른다).
// - 차례: 시민권(사이보그) → 저장한 정체성 → 이미 가문 → 소속 도시 → 창설(한 문장, house.ts) → 감사 기록. 기기가 보낸 cost는 보지 않는다
//   (옛 기기 호환으로 메시지에 남은 칸).
// - 도시를 얻을 때 봉신·독립을 고르는 길(D-216·D-340)은 houseCity.ts(마을 세우기·폐허 고르기, 질문 1005 가)다.
import type { HouseResultCode } from "@terra/protocol";
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import type { NationPreset } from "../npc/nations.ts";
import { foundHouse, houseOfUser, unfoundedIdentities } from "./house.ts";
import { cityHome, cyborgCityOf } from "./houseHome.ts";
import { type IdentityQueryable, loadIdentity } from "./store.ts";

export type HouseFoundResult =
  | { readonly ok: true; readonly factionId: number; readonly paid: string }
  | { readonly ok: false; readonly code: HouseResultCode };

export interface HouseFounderOptions {
  readonly pool: IdentityQueryable;
  readonly db?: Database | undefined;
  readonly now: () => number;
  /** 사용자의 나라(사이보그 시민권, cyborgs.faction_id). 사이보그가 없으면 undefined */
  readonly nationOf: (userId: string) => number | undefined | Promise<number | undefined>;
  /** 나라 이름(감사 기록에는 쓰지 않는다 — 소속 도시 조회가 함께 읽는다) */
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
      const citizenship = await o.nationOf(userId);
      if (citizenship === undefined) return fail("no_cyborg");
      const identity = await loadIdentity(o.pool, userId);
      if (!identity) return fail("no_identity");
      // 이미 가문이 있다: 창설했거나 다른 가문의 가문원이다(질문 985 — 사용자마다 한 가문)
      if (identity.factionId !== null || (await houseOfUser(o.pool, userId)) !== null)
        return fail("already_founded");
      // 소속 도시(D-565): 고른 도시 → 그 나라. 안 고르면 내 도시(없어졌으면 시민권 나라)
      const chosen = input.cityId ?? (await cyborgCityOf(o.pool, userId));
      const home = chosen === null ? null : await cityHome(o.pool, chosen, o.presets?.() ?? []);
      if (input.cityId !== undefined && !home) return fail("unknown_city");
      const nationId = home?.nationId ?? citizenship;
      const at = o.now();
      let factionId: number | null;
      try {
        factionId = await foundHouse(o.pool, { userId, nationId, homeCityId: home?.id ?? chosen, nowMs: at });
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
            nationId,
            homeCityId: home?.id ?? chosen,
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
 * 옛 정체성(계정 열쇠로 저장만 하고 가문이 없는 줄)을 가문으로 옮긴다 — 서버를 켤 때 한 번(질문 926 나 "정체성 = 가문 창설"이 되기 전에
 * 정한 것). 값은 받지 않는다(D-565 창설 무료). 소속 도시는 그 계정 사이보그의 내 도시. 사이보그(나라)가 없는 계정은 그대로 둔다(창설 화면에서 마친다). 약어가 다른 세력과 겹치면 건너뛴다(그 계정이
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
        (await foundHouse(pool, {
          userId: row.userId,
          nationId: row.nationId,
          homeCityId: row.cityId,
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
