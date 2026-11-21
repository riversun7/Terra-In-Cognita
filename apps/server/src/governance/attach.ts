// 나라 의결을 앱에 잇는다(factionIdentity/attach.ts가 부른다 — app.ts를 키우지 않으려고 가문 묶음에 얹는다). docs/adr/2026-11-21-governance.md 6절.
// - 서비스(service.ts)·조회(view.ts)·게이트웨이(gateway.ts, 가문 소켓과 한 소켓)를 세계 포트(port.ts)와 DB 위에 세운다.
// - 1분마다 틱(임기·자동 선출·NPC 표·닫기·집행). 세계가 준비되지 않았으면 아무것도 하지 않는다.
import type { Database } from "../db/client.ts";
import type { NationPreset } from "../npc/nations.ts";
import type { World } from "../world/world.ts";
import { type GovernanceGateway, createGovernanceGateway } from "./gateway.ts";
import { worldGovernancePort } from "./port.ts";
import type { GovernanceRules } from "./rules.ts";
import { type GovernanceService, createGovernanceService } from "./service.ts";
import { createGovernanceStore } from "./store.ts";
import { type GovernanceView, createGovernanceView } from "./view.ts";

/** 의결 틱 간격(ms) */
export const GOVERNANCE_TICK_MS = 60_000;

export interface GovernanceAttached {
  readonly service: GovernanceService;
  readonly view: GovernanceView;
  readonly gateway: GovernanceGateway;
  stop(): void;
}

export function attachGovernance(o: {
  readonly db: Database;
  readonly world: () => Pick<World, "status" | "npc" | "persistence"> | undefined;
  readonly rules: () => GovernanceRules;
  readonly presets?: (() => readonly NationPreset[]) | undefined;
  readonly now: () => number;
  readonly log: { info(obj: object, message: string): void; error(obj: object, message: string): void };
  /** 틱 타이머를 켜지 않는다(시험이 tick을 직접 부른다) */
  readonly manual?: boolean | undefined;
}): GovernanceAttached {
  const port = worldGovernancePort(o.world);
  const store = createGovernanceStore(o.db.$client);
  const service = createGovernanceService({ port, store, rules: o.rules, now: o.now, db: o.db, log: o.log });
  const view = createGovernanceView({ port, store, service, rules: o.rules, presets: o.presets, now: o.now });
  const gateway = createGovernanceGateway({ service: () => service, now: o.now, log: o.log });
  const timer = o.manual ? undefined : setInterval(() => void service.tick(), GOVERNANCE_TICK_MS);
  timer?.unref();
  return { service, view, gateway, stop: () => clearInterval(timer) };
}
