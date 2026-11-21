// 도시(정부) 지분 시장을 앱에 잇는다(factionIdentity/attach.ts가 부른다 — app.ts를 키우지 않으려고 가문·의결 묶음에 얹는다). docs/adr/2026-11-21-share-market.md.
// - 서비스(service.ts)·조회(view.ts)·소켓(gateway.ts — 가문·의결 소켓과 한 소켓)을 세계 포트(port.ts) 위에 세운다.
// - 15초마다 회차 경계를 본다(세계가 준비되지 않았으면 아무것도 하지 않는다).
import type { GovernanceAttached } from "../governance/attach.ts";
import type { HouseGovernanceGateway } from "../governance/gateway.ts";
import type { NationPreset } from "../npc/nations.ts";
import type { World } from "../world/world.ts";
import { type HouseShareGateway, createCityShareSocket, withCityShares } from "./gateway.ts";
import type { CityShareRules } from "./market.ts";
import { worldCitySharePort } from "./port.ts";
import { CITY_SHARE_TICK_MS, type CityShareService, createCityShareService } from "./service.ts";
import { type CityShareView, createCityShareView } from "./view.ts";

export interface CitySharesAttached {
  readonly service: CityShareService;
  readonly view: CityShareView;
  /** 가문·의결 소켓에 도시 지분 메시지를 더한다 */
  wrap(base: HouseGovernanceGateway): HouseShareGateway;
  stop(): void;
}

export function attachCityShares(o: {
  readonly world: () => Pick<World, "status" | "npc" | "persistence"> | undefined;
  readonly governance: () => GovernanceAttached | undefined;
  readonly rules: () => CityShareRules;
  readonly presets?: (() => readonly NationPreset[]) | undefined;
  readonly now: () => number;
  readonly log: { info(obj: object, message: string): void; error(obj: object, message: string): void };
  /** 틱 타이머를 켜지 않는다(시험이 tick을 직접 부른다) */
  readonly manual?: boolean | undefined;
}): CitySharesAttached {
  const port = worldCitySharePort(o.world);
  const service = createCityShareService({
    port,
    governance: o.governance,
    rules: o.rules,
    now: o.now,
    log: o.log,
  });
  const view = createCityShareView({
    port,
    service,
    governance: o.governance,
    presets: o.presets,
    now: o.now,
  });
  const socket = createCityShareSocket({ service: () => service, now: o.now, log: o.log });
  const timer = o.manual ? undefined : setInterval(() => void service.tick(), CITY_SHARE_TICK_MS);
  timer?.unref();
  return {
    service,
    view,
    wrap: (base) => withCityShares(base, socket),
    stop: () => clearInterval(timer),
  };
}
