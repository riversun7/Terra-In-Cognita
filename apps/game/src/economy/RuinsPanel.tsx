// 폐허 복원 칸(생산 칸, 신전 아래) — 기획 D-510(웨이브 폐허는 그 2차맵에 정부(행정 건물)를 먼저 지은 쪽이 주인, 주인이 복원 사업을 열어 지분
// 투자자를 모은다)·D-339(낸 돈만큼 도시 지분)·D-343(누구나)·D-344(독재 = 지배 가문 과반), docs/adr/2026-11-07-ruins-restoration.md.
// 기술 기본 화면이다(옛 화면 없음).
// - 자료는 tRPC ruins.overview(실제 자료만). 바꾸는 명령은 WebSocket: 정부 짓기 = 건물 짓기(facilityCommands.ts facility_build, 행정 건물),
//   모금 열기·넣기·개발 시험 폐허(ruinsCommands.ts, 프로토콜 13). 서버가 판정한다(폐허 자리·주인·모금 열림·잔고·남은 몫). 화면은 막는 까닭만 보인다.
// - 차례: 설명·규칙(행정 건물 재료) → 개발 시험 → 내 잔고 → 폐허 카드(옛 주인·자리, 주인 없음 = [정부 짓기], 주인 있음 = 모금 막대·내 몫·지분
//   미리 셈·[모금 열기]·넣기).
import type { RuinView, RuinsOverviewResponse } from "@terra/shared/ruins";
import { useState } from "react";
import { m } from "../paraglide/messages.js";
import { formatAmount } from "../roster/rosterText.ts";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { sendFusionCommand } from "../units/fusionCommands.ts";
import { RESULT_TEXT as FUSION_RESULT_TEXT } from "../units/fusionParts.tsx";
import { pickName } from "./economyText.ts";
import { sendFacilityCommand } from "./facilityCommands.ts";
import { FACILITY_ERROR_TEXT } from "./facilityText.ts";
import { Loaded } from "./parts.tsx";
import { NO_ARGS, useFacilities, useRuins } from "./queries.ts";
import { type RuinCommand, type RuinOutcome, sendRuinCommand } from "./ruinsCommands.ts";
import "./ruins.css";

type RuinCode = Extract<RuinOutcome, { ok: false }>["code"];

const RUIN_ERROR_TEXT: Readonly<Record<RuinCode, () => string>> = {
  sign_in_required: m.ruins_err_sign_in,
  busy: m.ruins_err_busy,
  rate_limited: m.ruins_err_rate_limited,
  internal_error: m.ruins_err_internal,
  forbidden: m.ruins_err_forbidden,
  no_cyborg: m.ruins_err_no_cyborg,
  unknown_ruin: m.ruins_err_unknown_ruin,
  not_claimed: m.ruins_err_not_claimed,
  not_owner: m.ruins_err_not_owner,
  already_open: m.ruins_err_already_open,
  not_open: m.ruins_err_not_open,
  insufficient_funds: m.ruins_err_funds,
  invalid_amount: m.ruins_err_invalid_amount,
  no_faction: m.ruins_err_no_faction,
  no_place: m.ruins_err_no_place,
  offline: m.ruins_err_offline,
  timeout: m.ruins_err_timeout,
};

/** 명령 하나의 결과 문구(성공·실패) */
interface Said {
  readonly ok: boolean;
  readonly text: string;
}

type Run = (key: string, action: () => Promise<Said>) => Promise<void>;

/** 개발 시험 화폐 한 번(최소 단위) */
const DEV_CURRENCY = 100_000;

/** 10진 최소 단위 금액(앞 0 없음) */
const isAmount = (value: string): boolean => /^[1-9][0-9]{0,30}$/.test(value);

/** 폐허 명령 하나를 보내고 결과 문구를 만든다 */
const ruinAction =
  (command: RuinCommand, success: (outcome: Extract<RuinOutcome, { ok: true }>) => string) =>
  async (): Promise<Said> => {
    const outcome = await sendRuinCommand(command);
    return outcome.ok
      ? { ok: true, text: success(outcome) }
      : { ok: false, text: RUIN_ERROR_TEXT[outcome.code]() };
  };

/** 카드 상태: 주인 없음 · 주인만 넣음 · 모금 중 */
function stateOf(ruin: RuinView): "unclaimed" | "owner_only" | "open" {
  if (ruin.project === null) return "unclaimed";
  return ruin.project.open ? "open" : "owner_only";
}

const STATE_TEXT = {
  unclaimed: m.ruins_state_unclaimed,
  owner_only: m.ruins_state_owner_only,
  open: m.ruins_state_open,
} as const;

/** 모인 값 ‰(0~1000) */
function raisedPm(goal: string, raised: string): number {
  const total = BigInt(goal);
  if (total <= 0n) return 0;
  return Number((BigInt(raised) * 1000n) / total);
}

function ProjectPart({ ruin, busy, run }: { ruin: RuinView; busy: string | null; run: Run }) {
  const [amount, setAmount] = useState("");
  const project = ruin.project;
  if (project === null) return null;
  const pm = raisedPm(project.goal, project.raised);
  const pct = Math.floor(pm / 10);
  const left = BigInt(project.goal) - BigInt(project.raised);
  return (
    <>
      <div className="facility-meter-row">
        <div
          className="facility-meter"
          role="meter"
          aria-label={m.ruins_progress_label({ id: ruin.id })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${pct}%`}
        >
          <span className="facility-meter-fill" style={{ inlineSize: `${pm / 10}%` }} />
        </div>
        <span className="facility-meter-text eco-num">{pct}%</span>
      </div>
      <p className="eco-num" data-part="ruin-progress">
        {m.ruins_progress({ raised: formatAmount(project.raised), goal: formatAmount(project.goal) })}
      </p>
      <p className="eco-footnote">{m.ruins_mine({ amount: formatAmount(project.mine) })}</p>
      {project.shares.length > 0 ? (
        <ul className="ruins-shares" aria-label={m.ruins_shares_title()}>
          {project.shares.slice(0, 4).map((row) => (
            <li key={`${row.label}-${row.shares}`} className="ruins-share" data-mine={row.mine}>
              <span className="ruins-share-name">{row.mine ? m.ruins_share_me() : row.label}</span>
              <span className="eco-num">
                {m.ruins_share_count({ count: formatAmount(String(row.shares)) })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {ruin.owner?.mine && !project.open ? (
        <div className="labor-actions">
          <button
            type="button"
            className="button-small ruins-open"
            disabled={busy !== null}
            aria-busy={busy === `open-${ruin.id}`}
            onClick={() =>
              void run(
                `open-${ruin.id}`,
                ruinAction({ t: "restoration_open", ruin: ruin.id }, () => m.ruins_opened({ id: ruin.id })),
              )
            }
          >
            {m.ruins_open()}
          </button>
        </div>
      ) : null}
      {project.canFund ? (
        <form
          className="ruins-fund"
          onSubmit={(event) => {
            event.preventDefault();
            if (!isAmount(amount)) return;
            void run(
              `fund-${ruin.id}`,
              ruinAction({ t: "restoration_fund", ruin: ruin.id, amount }, (outcome) =>
                outcome.restored
                  ? m.ruins_restored({ id: ruin.id })
                  : m.ruins_funded({ amount: formatAmount(outcome.accepted ?? "0") }),
              ),
            );
            setAmount("");
          }}
        >
          <label className="ruins-field">
            <span>{m.ruins_fund_label({ left: formatAmount(String(left)) })}</span>
            <input
              inputMode="numeric"
              autoComplete="off"
              value={amount}
              onChange={(event) => setAmount(event.target.value.trim())}
            />
          </label>
          <button
            type="submit"
            className="button-small ruins-fund-go"
            disabled={busy !== null || !isAmount(amount)}
            aria-busy={busy === `fund-${ruin.id}`}
          >
            {m.ruins_fund()}
          </button>
        </form>
      ) : (
        <p className="field-hint">{m.ruins_fund_closed()}</p>
      )}
    </>
  );
}

function RuinCard({
  ruin,
  data,
  busy,
  run,
}: {
  ruin: RuinView;
  data: RuinsOverviewResponse;
  busy: string | null;
  run: Run;
}) {
  const state = stateOf(ruin);
  const government = data.government;
  const at = ruin.buildAt;
  const former = ruin.formerOwner
    ? pickName(ruin.formerOwner.name ?? undefined, ruin.formerOwner.code ?? "—")
    : "—";
  return (
    <li className="ruins-card" data-part="ruin-card" data-ruin={ruin.id} data-state={state}>
      <div className="ruins-card-head">
        <p className="ruins-card-title">{m.ruins_card_title({ id: ruin.id })}</p>
        <span className="eco-tag ruins-state" data-state={state}>
          {STATE_TEXT[state]()}
        </span>
        {ruin.owner?.mine ? <span className="eco-tag">{m.ruins_mine_tag()}</span> : null}
      </div>
      <p className="eco-footnote">{m.ruins_card_meta({ map: ruin.mapKey, x: ruin.x, y: ruin.y, former })}</p>
      {ruin.owner ? (
        <p data-part="ruin-owner">
          {m.ruins_owner({
            owner: ruin.owner.mine ? m.ruins_share_me() : ruin.owner.label,
            joins: ruin.owner.joins
              ? pickName(ruin.owner.joins.name ?? undefined, ruin.owner.joins.code ?? "—")
              : "—",
          })}
        </p>
      ) : null}
      {ruin.project ? (
        <ProjectPart ruin={ruin} busy={busy} run={run} />
      ) : government && at ? (
        <>
          <p className="field-hint">{m.ruins_build_hint({ x: at.x, y: at.y })}</p>
          <div className="labor-actions">
            {data.dev ? (
              <button
                type="button"
                className="button-small ruins-dev-materials"
                disabled={busy !== null}
                aria-busy={busy === `materials-${ruin.id}`}
                onClick={() =>
                  void run(`materials-${ruin.id}`, async () => {
                    // 개발 시험 재료(건물 칸 [시험 재료 받기]와 같은 명령, 그 칸의 도시 창고로)
                    for (const stack of government.materials) {
                      const outcome = await sendFacilityCommand({
                        t: "dev_facility_grant",
                        item: stack.item,
                        qty: stack.qty,
                        mapKey: ruin.mapKey,
                        x: at.x,
                        y: at.y,
                      });
                      if (!outcome.ok) return { ok: false, text: FACILITY_ERROR_TEXT[outcome.code]() };
                    }
                    return { ok: true, text: m.ruins_dev_materials_done() };
                  })
                }
              >
                {m.ruins_dev_materials()}
              </button>
            ) : null}
            <button
              type="button"
              className="button-small ruins-build"
              disabled={busy !== null || !data.hasCyborg}
              aria-busy={busy === `build-${ruin.id}`}
              onClick={() =>
                void run(`build-${ruin.id}`, async () => {
                  const outcome = await sendFacilityCommand({
                    t: "facility_build",
                    mapKey: ruin.mapKey,
                    facility: government.facilityId,
                    x: at.x,
                    y: at.y,
                    rotation: 0,
                    unitIds: [],
                  });
                  useFacilities.refreshAll();
                  return outcome.ok
                    ? { ok: true, text: m.ruins_claimed({ id: ruin.id }) }
                    : { ok: false, text: FACILITY_ERROR_TEXT[outcome.code]() };
                })
              }
            >
              {m.ruins_build({ name: pickName(government.name, government.facilityId) })}
            </button>
          </div>
        </>
      ) : (
        <p className="field-hint">{m.ruins_build_no_room()}</p>
      )}
    </li>
  );
}

export function RuinsPanel() {
  const ruins = useRuins(NO_ARGS);
  const live = useLiveLines();
  const [busy, setBusy] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error">("success");
  const run: Run = async (key, action) => {
    if (busy !== null) return;
    setBusy(key);
    try {
      const said = await action();
      setTone(said.ok ? "success" : "error");
      live.show([said.text]);
    } finally {
      ruins.refresh();
      setBusy(null);
    }
  };
  return (
    <section className="panel labor ruins" aria-labelledby="ruins-title" data-part="ruins">
      <h2 id="ruins-title" className="eco-section-title">
        {m.ruins_title()}
      </h2>
      <p className="eco-footnote">{m.ruins_lead()}</p>
      <Loaded view={ruins}>
        {(loaded) => {
          if (loaded.status === "not_ready") return <p className="eco-empty">{m.ruins_not_ready()}</p>;
          const government = loaded.government;
          return (
            <>
              <ul className="ruins-rules">
                <li>{m.ruins_rule_owner()}</li>
                <li>{m.ruins_rule_fund()}</li>
                <li>{m.ruins_rule_dictatorship()}</li>
                {government ? (
                  <li>
                    {m.ruins_rule_materials({
                      name: pickName(government.name, government.facilityId),
                      list: government.materials
                        .map((stack) => `${pickName(stack.name, stack.item)} ${stack.qty}`)
                        .join(" · "),
                    })}
                  </li>
                ) : null}
              </ul>
              {loaded.dev ? (
                <div className="labor-actions">
                  <button
                    type="button"
                    className="button-small ruins-dev-make"
                    disabled={busy !== null}
                    aria-busy={busy === "dev-make"}
                    onClick={() =>
                      void run(
                        "dev-make",
                        ruinAction({ t: "dev_make_ruin" }, (outcome) =>
                          m.ruins_dev_made({ id: outcome.ruinId ?? 0 }),
                        ),
                      )
                    }
                  >
                    {m.ruins_dev_make()}
                  </button>
                  <button
                    type="button"
                    className="button-small ruins-dev-currency"
                    disabled={busy !== null}
                    aria-busy={busy === "dev-currency"}
                    onClick={() =>
                      void run("dev-currency", async () => {
                        // 개발 시험 화폐(융합 개발 물자 받기와 같은 명령, dev·admin)
                        const outcome = await sendFusionCommand({
                          t: "dev_grant_goods",
                          item: "currency",
                          quantity: DEV_CURRENCY,
                        });
                        return outcome.ok
                          ? { ok: true, text: m.ruins_dev_currency_done() }
                          : { ok: false, text: FUSION_RESULT_TEXT[outcome.code]() };
                      })
                    }
                  >
                    {m.ruins_dev_currency({ amount: formatAmount(String(DEV_CURRENCY)) })}
                  </button>
                </div>
              ) : null}
              <p className="ruins-balance" data-part="ruins-balance">
                {loaded.hasCyborg
                  ? m.ruins_balance({ amount: formatAmount(loaded.balance) })
                  : m.ruins_no_cyborg()}
              </p>
              <h3 className="eco-subtitle">{m.ruins_list_title({ count: loaded.ruins.length })}</h3>
              {loaded.ruins.length === 0 ? <p className="eco-empty">{m.ruins_empty()}</p> : null}
              <ul className="ruins-list" data-part="ruins-list">
                {loaded.ruins.map((ruin) => (
                  <RuinCard key={ruin.id} ruin={ruin} data={loaded} busy={busy} run={run} />
                ))}
              </ul>
            </>
          );
        }}
      </Loaded>
      <LiveMessage tone={tone} lines={live.lines} version={live.version} />
    </section>
  );
}
