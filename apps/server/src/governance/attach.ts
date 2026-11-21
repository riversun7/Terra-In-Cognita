// 나라 의결을 앱에 잇는다(factionIdentity/attach.ts가 부른다 — app.ts를 키우지 않으려고 가문 묶음에 얹는다). docs/adr/2026-11-21-governance.md 6절.
// - 서비스(service.ts)·조회(view.ts)·게이트웨이(gateway.ts, 가문 소켓과 한 소켓)를 세계 포트(port.ts)와 DB 위에 세운다.
// - 1분마다 틱(임기·자동 선출·NPC 표·닫기·집행). 세계가 준비되지 않았으면 아무것도 하지 않는다.
import type { GovernanceTaxes } from "@terra/shared/governance";
import type { Database } from "../db/client.ts";
import type { NationPreset } from "../npc/nations.ts";
import type { World } from "../world/world.ts";
import type { CombatCatalog, CombatCoefficients } from "@terra/sim";
import { creditBookOf } from "../credit/book.ts";
import { creditOwnerOfUser, sweepCreditStandings } from "../credit/standing.ts";
import type { CoupCredit } from "./coup.ts";
import { createCoupStore } from "./coupStore.ts";
import { createLeaderStore } from "./leaderStore.ts";
import { type GovernanceGateway, createGovernanceGateway } from "./gateway.ts";
import { worldGovernancePort } from "./port.ts";
import type { GovernanceRules } from "./rules.ts";
import { type ApprovedShareSale, type GovernanceService, createGovernanceService } from "./service.ts";
import { createGovernanceStore } from "./store.ts";
import { type GovernanceView, createGovernanceView } from "./view.ts";

/** 의결 틱 간격(ms) */
export const GOVERNANCE_TICK_MS = 60_000;
/** 켤 때 세계 준비를 보는 간격(ms) */
const GOVERNANCE_BOOT_POLL_MS = 5_000;

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
  /** 가결된 세율 안건을 나라 세금에 쓴다(질문 2407 가 — factionIdentity/attach.ts) */
  readonly applyTaxes?:
    | ((nationRowId: number, taxes: GovernanceTaxes, nowMs: number) => Promise<boolean>)
    | undefined;
  /** 쿠데타 전투 자료(없으면 시험 자료 — 줄기 governance-3 [임시]: 앱이 아직 넘기지 않는다) */
  readonly combat?:
    | (() => { readonly catalog: CombatCatalog; readonly rules: CombatCoefficients })
    | undefined;
  /** 승인된 국고 지분 팔기(질문 2438 답 D-583 — 정부 지분 시장 줄기가 붙인다) */
  readonly approvedShareSale?: ((sale: ApprovedShareSale, nowMs: number) => Promise<void>) | undefined;
  /** 틱 타이머를 켜지 않는다(시험이 tick을 직접 부른다) */
  readonly manual?: boolean | undefined;
}): GovernanceAttached {
  // 쿠데타 전투 자료: 넘긴 것이 없으면 NPC 런타임 정원사가 쓰는 팩 전투 자료(줄기 governance-5 — app.ts를 키우지 않는다), 그것도 없으면 시험 자료
  const port = worldGovernancePort(o.world, o.combat ?? (() => o.world()?.npc?.gardener.combat()));
  // 쿠데타 신용(D-584 — credit/): 혁명군 가담 내림·이긴 편 새 나라 시작 가산
  const creditOf = () => {
    const ledger = o.world()?.persistence?.ledger;
    return ledger ? creditBookOf(ledger) : undefined;
  };
  const credit: CoupCredit = {
    joined(userId, nowMs) {
      const owner = creditOwnerOfUser(o.world(), userId);
      if (owner !== undefined) creditOf()?.event(owner, "coup_join", nowMs);
    },
    won(userId, nationOwnerId, amount, nowMs) {
      const owner = creditOwnerOfUser(o.world(), userId);
      const book = creditOf();
      if (owner === undefined || !book) return;
      if (nationOwnerId === undefined) book.bonus(owner, amount, nowMs);
      else book.restartAt(owner, nationOwnerId, amount, nowMs);
    },
  };
  const store = createGovernanceStore(o.db.$client);
  const coups = createCoupStore(o.db.$client);
  const service = createGovernanceService({
    port,
    store,
    rules: o.rules,
    now: o.now,
    db: o.db,
    log: o.log,
    applyTaxes: o.applyTaxes,
    coups,
    approvedShareSale: o.approvedShareSale,
    leader: createLeaderStore(o.db.$client),
    credit,
  });
  const view = createGovernanceView({ port, store, service, rules: o.rules, presets: o.presets, now: o.now });
  const gateway = createGovernanceGateway({ service: () => service, now: o.now, log: o.log });
  // 틱마다 신용 소속도 훑는다(credit/standing.ts — 소속 기간·사업장 운영 오름, D-584)
  const tick = async (): Promise<void> => {
    await service.tick();
    sweepCreditStandings(o.world(), o.now());
  };
  const timer = o.manual ? undefined : setInterval(() => void tick(), GOVERNANCE_TICK_MS);
  timer?.unref();
  // 켤 때: 세계가 준비되면 바로 한 번 돈다(지배 가문 반영·지분 정리를 첫 1분 틱까지 미루지 않는다 — governance-2)
  let boot: ReturnType<typeof setTimeout> | undefined;
  const first = (): void => {
    if (port.ready()) {
      void tick();
      return;
    }
    boot = setTimeout(first, GOVERNANCE_BOOT_POLL_MS);
    boot.unref();
  };
  if (!o.manual) first();
  return {
    service,
    view,
    gateway,
    stop: () => {
      clearInterval(timer);
      clearTimeout(boot);
    },
  };
}
