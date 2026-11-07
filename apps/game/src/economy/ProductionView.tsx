// 생산(/economy/production) — 시설(레벨·일꾼·상태·지금 만드는 것·예약), 반복 예약(D-6016), 급여(D-431·D-432),
// 건물 짓기·노화·수리·채집 시설 직무 배치(FacilityPanel.tsx, 실제 자료), 정부기관 구인 카드 고용(RecruitPanel.tsx, D-469 — docs/adr/2026-11-07-play-flow.md
// "WP3 플레이어 생산"), 신전(TemplePanel.tsx), 폐허 복원(RuinsPanel.tsx, D-510), 노동 계약(임금형·임대형, D-479 — LaborPanel.tsx, 실제 자료),
// 레시피 목록(팩).
// 시설·예약은 서버가 생산을 돌릴 때까지 시안 자료에서만 보인다. 레시피 목록은 실제 팩 자료다.
// 예약 단추는 명령을 보내지 않는다(곧 열림, 생산 예약 명령은 WebSocket으로 붙인다).
import type {
  CatalogRecipeView,
  EconomyProductionResponse,
  ProductionFacility,
  RepeatOrder,
  WageLine,
} from "@terra/shared/economy";
import { m } from "../paraglide/messages.js";
import { formatRate } from "./amount.ts";
import {
  type CatalogIndex,
  STATUS_NAMES,
  currencyName,
  facilityName,
  fmt,
  formatDuration,
  indexCatalog,
  itemName,
  lotOf,
  lotText,
  recipeName,
  stageName,
  statPairText,
} from "./economyText.ts";
import { FacilityPanel } from "./FacilityPanel.tsx";
import { LaborPanel } from "./LaborPanel.tsx";
import { RecruitPanel } from "./RecruitPanel.tsx";
import { RuinsPanel } from "./RuinsPanel.tsx";
import { TemplePanel } from "./TemplePanel.tsx";
import { NotReady, PreviewTag } from "./parts.tsx";
import { NO_ARGS, useCatalog, useNowTick, useProduction } from "./queries.ts";
import { dailyWage, progressOf } from "./shape.ts";

function FacilityCard({
  facility,
  index,
  now,
  preview,
}: {
  facility: ProductionFacility;
  index: CatalogIndex;
  now: number;
  preview: boolean;
}) {
  const run = facility.current;
  const progress = run ? progressOf(run.startedAt, run.endsAt, now) : 0;
  const queued = facility.queue.reduce((sum, entry) => sum + entry.batches, 0);
  const titleId = `eco-facility-${facility.id}`;
  return (
    <section className="panel eco-facility" aria-labelledby={titleId}>
      <div className="eco-place-head">
        <h3 id={titleId} className="eco-place-title">
          {facilityName(index, facility.facility)}
        </h3>
        <span className="eco-tag">{m.economy_facility_level({ level: facility.level })}</span>
        {preview ? <PreviewTag /> : null}
      </div>
      <p className="eco-facility-meta">
        <span>{facility.place}</span>
        <span>{m.economy_facility_workers({ workers: facility.workers, slots: facility.slots })}</span>
        <span className="eco-status" data-status={facility.status}>
          {STATUS_NAMES[facility.status]()}
        </span>
      </p>
      {run ? (
        <div className="eco-run">
          <span className="eco-run-name">{recipeName(index, run.recipe)}</span>
          <div
            className="eco-bar"
            role="progressbar"
            aria-label={recipeName(index, run.recipe)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <span className="eco-bar-fill" style={{ inlineSize: `${(progress * 100).toFixed(1)}%` }} />
          </div>
          <span className="eco-run-left">
            {m.economy_run_left({ time: formatDuration(run.endsAt - now) })}
          </span>
        </div>
      ) : null}
      <div className="eco-facility-foot">
        <span className="eco-facility-queue">
          {queued > 0 ? m.economy_queue({ count: queued }) : m.economy_queue_none()}
        </span>
        <button
          type="button"
          className="button-small"
          aria-disabled="true"
          aria-describedby="eco-production-soon"
        >
          {m.economy_queue_add()}
        </button>
      </div>
    </section>
  );
}

function RepeatRow({
  repeat,
  data,
  index,
}: {
  repeat: RepeatOrder;
  data: EconomyProductionResponse;
  index: CatalogIndex;
}) {
  const facility = data.facilities.find((entry) => entry.id === repeat.facility);
  const condition =
    repeat.condition.kind === "below"
      ? m.economy_repeat_below({
          item: itemName(index, repeat.condition.item),
          qty: fmt(repeat.condition.qty),
        })
      : m.economy_repeat_every({ hours: repeat.condition.hours });
  return (
    <li className="eco-row">
      <span className="eco-row-main">
        <span className="eco-row-title">{recipeName(index, repeat.recipe)}</span>
        <span className="eco-row-meta">
          {facility ? `${facilityName(index, facility.facility)} · ${facility.place} · ` : ""}
          {condition}
        </span>
      </span>
      <span className="eco-tag" data-tone={repeat.enabled ? "on" : undefined}>
        {repeat.enabled ? m.economy_repeat_on() : m.economy_repeat_off()}
      </span>
    </li>
  );
}

function WageRow({ wage, index }: { wage: WageLine; index: CatalogIndex }) {
  const adjust = `${wage.adjustBp < 0 ? "−" : "+"}${formatRate(wage.adjustBp)}`;
  return (
    <li className="eco-row">
      <span className="eco-row-main">
        <span className="eco-row-title">
          {facilityName(index, wage.job)} · {wage.place}
        </span>
        <span className="eco-row-meta">
          {m.economy_wage_workers({ workers: wage.workers, efficiency: fmt(String(wage.efficiency)) })} ·{" "}
          {m.economy_wage_base({ amount: fmt(wage.baseWage) })} · {m.economy_wage_adjust({ pct: adjust })}
        </span>
      </span>
      <span className="eco-row-end">
        <span className="eco-num">
          {m.economy_wage_daily({
            amount: fmt(dailyWage(wage.baseWage, wage.adjustBp, wage.efficiency, wage.workers)),
          })}
        </span>
        <span className="eco-row-meta">{currencyName(index, wage.currency)}</span>
      </span>
    </li>
  );
}

function RecipeRow({ recipe, index }: { recipe: CatalogRecipeView; index: CatalogIndex }) {
  // 수량은 묶음 단위(302·D-506): 묶음이 1보다 크면 묶음 크기를 붙인다(광석 "×10 (묶음 1 kg)")
  const stackText = (stack: CatalogRecipeView["inputs"][number]): string => {
    const item = index.items.get(stack.item);
    const name = itemName(index, stack.item);
    return lotOf(item) > 1n
      ? m.economy_stack_lot({ name, qty: fmt(stack.qty), size: lotText(item) })
      : `${name} ×${fmt(stack.qty)}`;
  };
  const stacks = (list: CatalogRecipeView["inputs"]) => list.map(stackText).join(", ");
  const gather = recipe.gather;
  const select = gather?.mode === "select";
  const worker = recipe.worker;
  const harvest = worker?.tierHarvestMs ?? null;
  return (
    <li className="eco-row" data-recipe={recipe.id}>
      <span className="eco-row-main">
        <span className="eco-row-title">{recipeName(index, recipe.id)}</span>
        <span className="eco-row-meta">
          {recipe.inputs.length === 0 ? m.economy_recipe_from_nothing() : stacks(recipe.inputs)} →{" "}
          {stacks(recipe.outputs)}
        </span>
        {gather ? (
          <span className="eco-row-meta">
            {(select ? m.economy_recipe_select : m.economy_recipe_gather)({
              stats: statPairText(gather.primary, gather.secondary),
            })}
          </span>
        ) : null}
        {worker ? <WorkerLines worker={worker} /> : null}
      </span>
      <span className="eco-row-end">
        <span className="eco-tag">
          {select && worker?.unitTier !== null && worker?.unitTier !== undefined
            ? m.economy_tier_select({ tier: worker.unitTier })
            : gather
              ? m.economy_tier_rolled()
              : m.economy_tier({ tier: recipe.tier })}
        </span>
        <span className="eco-row-meta">
          {/* 사다리 산출은 나온 티어가 시간을 정한다(모두 T0일 때 한 번 돌리는 시간부터, D-507). 그 밖은 레시피 작업량 시간 */}
          {harvest
            ? m.economy_recipe_time_from({
                time: formatDuration(
                  (harvest[0] ?? 0) * recipe.outputs.reduce((sum, stack) => sum + Number(stack.qty), 0),
                ),
              })
            : m.economy_recipe_time({ time: formatDuration(recipe.baseDurationMs) })}
        </span>
      </span>
    </li>
  );
}

/** 일꾼 스탯 효과(옛 1차 생산 규칙, D-507): 기준 유닛의 속도·한 번에 개수, 식, 사다리면 티어별 한 번 시간 */
function WorkerLines({ worker }: { worker: NonNullable<CatalogRecipeView["worker"]> }) {
  const primary = worker.primary.toUpperCase();
  const secondary = worker.secondary.toUpperCase();
  const rate = (worker.yieldPerStatPm / 1000).toFixed(2);
  const formula = { primary, secondary, divisor: worker.progressDivisor, base: worker.yieldBase, rate };
  const harvest = worker.tierHarvestMs;
  return (
    <>
      <span className="eco-row-meta" data-part="worker-effect">
        {m.economy_worker_effect({
          stat: worker.unitStat,
          primary,
          progress: worker.unitProgress,
          secondary,
          count: worker.unitYield,
        })}
      </span>
      <span className="eco-row-meta" data-part="worker-formula">
        {worker.yieldCap === null
          ? m.economy_worker_formula_open(formula)
          : m.economy_worker_formula({ ...formula, cap: worker.yieldCap })}
      </span>
      {harvest ? (
        <span className="eco-row-meta" data-part="worker-harvest">
          {m.economy_worker_harvest({
            t0: formatDuration(harvest[0] ?? 0),
            t1: formatDuration(harvest[1] ?? 0),
            t2: formatDuration(harvest[2] ?? 0),
            t3: formatDuration(harvest[3] ?? 0),
          })}
        </span>
      ) : null}
    </>
  );
}

export default function ProductionView() {
  const catalog = useCatalog(NO_ARGS);
  const production = useProduction(NO_ARGS);
  const tick = useNowTick();
  const index = indexCatalog(catalog.data);
  const data = production.data;
  const now = data ? data.generatedAt + Math.max(0, tick - production.receivedAt) : tick;
  // 레시피는 시설 단계(D-114) 차례로 묶는다
  const stages = catalog.data
    ? [...new Set(catalog.data.facilities.map((facility) => facility.stage))].map((stage) => ({
        stage,
        recipes: (catalog.data?.recipes ?? []).filter(
          (recipe) => index.facilities.get(recipe.facility)?.stage === stage,
        ),
      }))
    : [];
  return (
    <div className="eco-stack">
      <p id="eco-production-soon" className="visually-hidden">
        {m.economy_submit_soon()}
      </p>
      {data === null ? (
        <p className="status eco-loading" role="status">
          {production.status === "failed" ? m.economy_load_failed() : m.shell_loading()}
        </p>
      ) : data.status === "not_ready" ? (
        <NotReady body={m.economy_not_ready_production()} />
      ) : (
        <>
          <h2 className="eco-section-title">{m.economy_facilities_title()}</h2>
          <div className="eco-places">
            {data.facilities.map((facility) => (
              <FacilityCard
                key={facility.id}
                facility={facility}
                index={index}
                now={now}
                preview={data.preview}
              />
            ))}
          </div>
          <section className="panel" aria-labelledby="eco-repeats-title">
            <h2 id="eco-repeats-title" className="eco-section-title">
              {m.economy_repeats_title()}
            </h2>
            {data.repeats.length === 0 ? (
              <p className="eco-empty">{m.economy_repeats_empty()}</p>
            ) : (
              <ul className="eco-rows">
                {data.repeats.map((repeat) => (
                  <RepeatRow key={repeat.id} repeat={repeat} data={data} index={index} />
                ))}
              </ul>
            )}
          </section>
          <section className="panel" aria-labelledby="eco-wages-title">
            <h2 id="eco-wages-title" className="eco-section-title">
              {m.economy_wages_title()}
            </h2>
            <p className="eco-footnote">{m.economy_wage_formula()}</p>
            <ul className="eco-rows">
              {data.wages.map((wage) => (
                <WageRow key={`${wage.job}-${wage.place}`} wage={wage} index={index} />
              ))}
            </ul>
          </section>
        </>
      )}
      <FacilityPanel />
      <RecruitPanel />
      <TemplePanel />
      <RuinsPanel />
      <LaborPanel />
      <section className="panel" aria-labelledby="eco-recipes-title">
        <h2 id="eco-recipes-title" className="eco-section-title">
          {m.economy_recipes_title()}
        </h2>
        {stages.map((group) =>
          group.recipes.length === 0 ? null : (
            <div key={group.stage} className="eco-recipe-group">
              <h3 className="eco-subtitle">{stageName(group.stage)}</h3>
              <ul className="eco-rows">
                {group.recipes.map((recipe) => (
                  <RecipeRow key={recipe.id} recipe={recipe} index={index} />
                ))}
              </ul>
            </div>
          ),
        )}
      </section>
    </div>
  );
}
