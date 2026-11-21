// 지도자끼리 조약을 앱에 잇는다(factionIdentity/attach.ts가 부른다 — app.ts를 키우지 않으려고 가문·의결 묶음에 얹는다). docs/adr/2026-11-21-diplomacy-treaties.md.
// - 서비스(service.ts)·조회(view.ts)·소켓(gateway.ts — 가문·의결·도시 지분 소켓과 한 소켓)을 의결 서비스·포트와 DB 위에 세운다.
// - 의결이 고리(hooks — 조약 비준 집행·강화 제안)를 부른다. 틱은 의결 틱 뒤에 의결 사슬에서 돈다(attachGovernance afterTick).
import type { Database } from "../db/client.ts";
import type { GovernanceAttached } from "../governance/attach.ts";
import type { NationPreset } from "../npc/nations.ts";
import type { World } from "../world/world.ts";
import type { HouseShareGateway } from "../cityShares/gateway.ts";
import { type HouseDiplomacyGateway, createDiplomacySocket, withDiplomacy } from "./gateway.ts";
import { worldDiplomacyPort } from "./port.ts";
import { type DiplomacyService, createDiplomacyService } from "./service.ts";
import { createDiplomacyStore } from "./store.ts";
import { type DiplomacyView, createDiplomacyView } from "./view.ts";

export interface DiplomacyAttached {
  readonly service: DiplomacyService;
  readonly view: DiplomacyView;
  /** 가문·의결·도시 지분 소켓에 조약 메시지를 더한다 */
  wrap(base: HouseShareGateway): HouseDiplomacyGateway;
}

export function attachDiplomacy(o: {
  readonly db: Database;
  readonly world: () => Pick<World, "status" | "npc" | "persistence"> | undefined;
  readonly governance: GovernanceAttached;
  readonly presets?: (() => readonly NationPreset[]) | undefined;
  readonly now: () => number;
  readonly log: { info(obj: object, message: string): void; error(obj: object, message: string): void };
}): DiplomacyAttached {
  const rules = o.governance.rules;
  const port = worldDiplomacyPort(o.world, o.governance.port, rules);
  const store = createDiplomacyStore(o.db.$client);
  const service = createDiplomacyService({
    governance: () => o.governance.service,
    gstore: o.governance.store,
    port,
    store,
    rules,
    now: o.now,
    db: o.db,
    log: o.log,
  });
  const view = createDiplomacyView({
    port,
    store,
    gstore: o.governance.store,
    governance: () => o.governance.service,
    service,
    rules,
    presets: o.presets,
    now: o.now,
  });
  const socket = createDiplomacySocket({ service: () => service, now: o.now, log: o.log });
  return { service, view, wrap: (base) => withDiplomacy(base, socket) };
}
