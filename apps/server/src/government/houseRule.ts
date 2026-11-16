// 정부 판의 가문 몫 — 질문 2012 답(국가 지도자 = 지배 가문의 장, D-217)·질문 2018 답(가문 이동 정책 — 도시·나라 칸, 정부 판에 최소한으로).
// docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-16, 2011·2012·2014·2017·2018 답)". 읽기만 한다(정하기는 WebSocket house_entry_policy).
// - 플레이어 가문 나라(도시를 가진 가문 — 소유 주체가 있는 가문 세력 행)의 지도자 = 그 가문장: 사이보그 본체 유닛·이름·가문 이름(세력 정체성).
// - 가문 이동 정책 칸: factionIdentity/houseEntryPolicy.ts readHouseEntryPolicy(보는 사람이 정할 수 있는지 포함).
import { readHouseEntryPolicy } from "../factionIdentity/houseEntryPolicy.ts";
import type { SocietyCoefficients } from "@terra/sim";
import { TEST_HOUSE_RULES, houseRulesFrom } from "../factionIdentity/rules.ts";
import type { IdentityQueryable } from "../factionIdentity/store.ts";
import type { World } from "../world/world.ts";
import type { GovernmentSource } from "./reads.ts";

export function houseGovernmentSources(
  world: Pick<World, "persistence">,
  pool: IdentityQueryable,
  /** 설정 칸 실효 값(없으면 시험 계수표 — 팩 없이 띄운 서버) */
  tuning: { society(): SocietyCoefficients } | undefined,
): Required<Pick<GovernmentSource, "houseLeader" | "houseEntry">> {
  return {
    async houseLeader(factionRow) {
      const { rows } = await pool.query<{ user_id: string; cyborg: string | null; house: string | null }>(
        `select m.user_id, c.name as cyborg, p.name as house from house_members m
           left join cyborgs c on c.user_id = m.user_id left join faction_profiles p on p.faction_id = m.faction_id
          where m.faction_id = $1 and m.role = 'leader'`,
        [factionRow],
      );
      const row = rows[0];
      if (!row) return undefined;
      return {
        unitId: world.persistence?.cyborgs.record(row.user_id)?.unitId ?? null,
        name: row.cyborg,
        house: row.house,
      };
    },
    houseEntry: (viewer, cityId) =>
      readHouseEntryPolicy(pool, {
        cityId,
        viewerId: viewer.id,
        rules: tuning ? houseRulesFrom(tuning.society()) : TEST_HOUSE_RULES,
      }),
  };
}
