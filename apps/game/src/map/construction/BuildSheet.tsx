// 2차맵 건축 모드 판 — 사용자 요청 2026-11-14 "2차맵에서 건설하는 기능 구현. 도시 버튼을 통해 2차맵에 건축모드로 진입한다"
// (docs/adr/2026-11-14-second-map-build.md, 기획 D-483 "배치 격자는 건축 모드에서만, 배치는 반투명 미리보기, 짓기 때 서버가 검증").
// - 목록 단계: 지을 수 있는 시설(크기·Lv1 재료·시간). 다른 세력 도시 2차맵이면(서버 땅 규칙 facilities.landRule) 까닭을 먼저 보인다.
// - 놓기 단계: 땅을 누르면 그 칸이 가운데가 되게 반투명 미리보기(엔진 층 createBuildPreview)와 격자. [회전]·[다른 건물]·[닫기]·[짓기].
//   기기 대략 판정(buildModel.ts — 밖·겹침·물가·재료·땅)으로 색과 단추를 정하고, 막힌 지형·유닛은 [짓기] 때 서버 결과로 알린다.
// - 채집소 반경(사용자 요청 2026-11-15 "건설시 … 오브젝트 포함할 반경 표시", docs/adr/2026-11-15-building-screen.md): 고른 시설이 원자재
//   오브젝트를 맡으면(gatherRadiusCells) 미리보기 자리(서버 판정과 같은 왼쪽 위 칸 기준)에 레벨 1 반경 고리를 그린다(채집 덧그림 고리).
// - 일꾼: 고른 내 유닛(지금 2차맵, 다른 작업 중이 아니면)을 넣는다(지금 규칙 — 건설 시간 단축). 건설 현장·납품·작업량은 2단계(ADR).
// - 빈 2차맵 알박기(기획 D-572·D-574·D-575): 정부(행정) 건물을 고르면 서버 미리 묻기(landRule claim)로 다 지었을 때 새 도시의 주인(가문 |
//   1인 독재 도시 | 세력)을 알리고, 가문·1인 도시면 "소속 국가로 귀속 | 독립"을 고른다(기본 = @terra/shared/facilities DEFAULT_LAND_CLAIM_MODE,
//   가문 독립이면 체제도). 가문이 이미 봉신·독립을 정했으면(claimLocked) 고르지 않고 그 상태를 알린다. 고른 것은 facility_build claim(프로토콜 62).
// - 명령은 WebSocket facility_build(facilityCommands.ts). 성공하면 건축 모드를 닫는다(건물은 지도 자료로 짓는 중 모습이 온다).
import type { SecondMapEngine } from "@terra/engine";
import { createBuildPreview } from "@terra/engine";
import {
  DEFAULT_LAND_CLAIM_MODE,
  LAND_CLAIM_REGIMES,
  type LandClaimMode,
  type LandClaimRegime,
} from "@terra/shared/facilities";
import { cityOfCell } from "@terra/shared/goodsPlaces";
import { type RefObject, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { waterStateOf } from "../../economy/FacilityPanel.tsx";
import { formatDuration, pickName } from "../../economy/economyText.ts";
import { sendFacilityCommand } from "../../economy/facilityCommands.ts";
import { FACILITY_ERROR_TEXT, canAfford, stacksText, stockAt } from "../../economy/facilityText.ts";
import { NO_ARGS, useFacilities, useLandRule, useWaterMask } from "../../economy/queries.ts";
import { m } from "../../paraglide/messages.js";
import type { GatherState } from "../gather/gatherState.ts";
import type { BuildMode } from "./buildMode.ts";
import {
  PLACEMENT_CELLS,
  type PlacementProblem,
  anchorForTap,
  placementProblems,
  quarterTurns,
  rotatedSize,
} from "./buildModel.ts";
import "./build.css";

const PROBLEM_TEXT: Readonly<Record<PlacementProblem, () => string>> = {
  no_cell: m.build_place_hint,
  out_of_bounds: m.build_problem_out_of_bounds,
  overlaps_building: m.build_problem_overlaps,
  needs_water: m.build_problem_water,
  insufficient_materials: m.build_problem_materials,
  foreign_city: m.build_problem_foreign_city,
};

/** 빈 2차맵 정부 건물이 다 지어지면 새 도시의 주인 → 안내 한 줄(알박기, D-572·D-574) */
const CLAIM_TEXT = {
  house: m.build_claim_house,
  personal: m.build_claim_personal,
  faction: m.build_claim_faction,
} as const;

const CLAIM_MODE_TEXT: Readonly<Record<LandClaimMode, () => string>> = {
  nation: m.build_claim_mode_nation,
  independent: m.build_claim_mode_independent,
};

const CLAIM_REGIME_TEXT: Readonly<Record<LandClaimRegime, () => string>> = {
  dictatorship: m.build_claim_regime_dictatorship,
  democracy: m.build_claim_regime_democracy,
  capitalism: m.build_claim_regime_capitalism,
};

export function BuildSheet({
  mode,
  engineRef,
  gather,
  mapKey,
  builder,
  operator = false,
}: {
  readonly mode: BuildMode;
  readonly engineRef: RefObject<SecondMapEngine | null>;
  readonly gather: GatherState;
  readonly mapKey: number;
  /** 고른 유닛(내 유닛이면 일꾼 후보), 없으면 null */
  readonly builder: number | null;
  /**
   * 운영자 모드(기획 D-560 1239 "건설도 제한 없이 다 가능"): 재료·땅 규칙을 기기에서 막지 않는다(서버가 권한을 다시 보고 재료 없이 짓는다).
   * 칸 겹침·물가 조건은 그대로 본다
   */
  readonly operator?: boolean | undefined;
}) {
  const state = useSyncExternalStore(mode.subscribe, mode.snapshot);
  useSyncExternalStore(
    (listener) => gather.subscribe(listener),
    () => gather.version,
  );
  const facilities = useFacilities(NO_ARGS);
  const data = facilities.data;
  const buildable = (data?.catalog ?? []).filter(
    (entry) => entry.footprint !== null && entry.levels.length > 0,
  );
  const chosen = state.facility === null ? undefined : buildable.find((entry) => entry.id === state.facility);
  const footprint = chosen?.footprint ?? null;
  const level1 = chosen?.levels[0];
  const anchor =
    footprint && state.tap
      ? anchorForTap(state.tap, footprint.width, footprint.height, state.rotation)
      : null;
  // 땅 규칙(정부 건물이 있는 남의 도시만 막는다, D-572 알박기 우선): 놓을 자리가 있으면 그 칸을, 없으면 2차맵 가운데를 묻는다 — 그 자리가
  // 다른 세력 영토면 알림(territoryFaction)
  const land = useLandRule(anchor ? [String(mapKey), String(anchor.x), String(anchor.y)] : [String(mapKey)]);
  // 재료 자리(D-516 361): 짓는 칸(없으면 2차맵 가운데)이 속한 도시 창고 + 그 도시 내 창고 시설 + 이 2차맵 내 유닛 화물
  const at = anchor ?? { x: PLACEMENT_CELLS / 2, y: PLACEMENT_CELLS / 2 };
  const city = data ? cityOfCell(data.cities, mapKey, at.x, at.y) : undefined;
  const stock = data ? stockAt(data, mapKey, city?.id ?? null) : new Map<string, bigint>();
  const waterRadius = chosen?.needsWaterWithin ?? null;
  const water = useWaterMask(waterRadius !== null ? [String(mapKey)] : null);
  const waterState = waterStateOf(
    water.data,
    waterRadius,
    footprint,
    anchor ? { x: anchor.x, y: anchor.y, rotation: state.rotation } : null,
  );
  // 운영자 모드도 땅 규칙은 본다(D-564 1663 — 운영자 모드가 없애는 것은 재료·건설 시간뿐)
  const landAllowed = land.data?.status === "ready" ? land.data.allowed : null;
  // 빈 2차맵 알박기(질문 2122 가): 정부 건물을 고르면 다 지었을 때의 편(서버 claimOf). 옛 서버는 칸이 없어 알리지 않는다
  const claim =
    chosen?.stage === "government" && land.data?.status === "ready" ? (land.data.claim ?? null) : null;
  const problems = footprint
    ? placementProblems({
        anchor,
        width: footprint.width,
        depth: footprint.height,
        rotation: state.rotation,
        buildings: gather.buildings,
        water: waterState,
        affordable: operator || (level1 ? canAfford(stock, level1.materials) : false),
        landAllowed,
      })
    : [];
  // 알박기 고르기(D-574): 가문(아직 안 정함)·1인 도시만 고른다. 세력·이미 정한 가문은 고르지 않는다
  const claimLocked = claim === "house" ? (land.data?.claimLocked ?? null) : null;
  const choosing = (claim === "house" && claimLocked === null) || claim === "personal";
  const [claimMode, setClaimMode] = useState<LandClaimMode>(DEFAULT_LAND_CLAIM_MODE);
  const [claimRegime, setClaimRegime] = useState<LandClaimRegime>("democracy");
  // 1인 독재 도시는 늘 독재(D-574 "유닛 독재 도시")
  const regimeSent: LandClaimRegime = claim === "personal" ? "dictatorship" : claimRegime;
  // 일꾼: 고른 유닛이 이 2차맵의 내 유닛이고 다른 작업 중이 아니면
  const worker = data?.units.find((unit) => unit.id === builder && unit.mapKey === mapKey && !unit.busy);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // 미리보기 층·격자: 건축 모드 동안 붙이고 닫으면 뗀다
  const previewRef = useRef<ReturnType<typeof createBuildPreview> | null>(null);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return () => undefined;
    const preview = createBuildPreview();
    previewRef.current = preview;
    const detach = engine.addLayer(preview.layer);
    engine.setViewOptions({ grid: true });
    engine.requestFrame();
    return () => {
      previewRef.current = null;
      detach();
      preview.dispose();
      engine.setViewOptions({ grid: false });
      engine.requestFrame();
    };
  }, [engineRef]);
  const valid = problems.length === 0;
  // 미리보기 갱신: 자리·크기·회전·판정이 바뀔 때만(원시 값으로 의존성)
  const ax = anchor?.x ?? null;
  const ay = anchor?.y ?? null;
  const fw = footprint?.width ?? null;
  const fd = footprint?.height ?? null;
  const rotation = state.rotation;
  // 채집소 반경 고리(레벨 1): 자리를 정했고 반경이 있는 시설일 때만
  const radius = chosen?.gatherRadiusCells ?? null;
  useEffect(() => {
    if (ax === null || ay === null || radius === null || radius <= 0) {
      gather.setRing(null);
      return () => undefined;
    }
    gather.setRing({ x: ax, y: ay, radius });
    return () => gather.setRing(null);
  }, [gather, ax, ay, radius]);
  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    if (ax === null || ay === null || fw === null || fd === null) preview.set(null);
    else preview.set({ cellX: ax, cellY: ay, width: fw, depth: fd, rotation: quarterTurns(rotation), valid });
    engineRef.current?.requestFrame();
  }, [ax, ay, fw, fd, rotation, valid, engineRef]);

  const send = async (): Promise<void> => {
    if (!chosen || !anchor || !valid || sending) return;
    setSending(true);
    setNotice(null);
    const outcome = await sendFacilityCommand({
      t: "facility_build",
      mapKey,
      facility: chosen.id,
      x: anchor.x,
      y: anchor.y,
      rotation: state.rotation,
      ...(worker ? { unitIds: [worker.id] } : {}),
      ...(choosing
        ? {
            claim:
              claimMode === "independent" ? { mode: claimMode, regime: regimeSent } : { mode: claimMode },
          }
        : {}),
    });
    setSending(false);
    if (!outcome.ok) {
      setNotice(FACILITY_ERROR_TEXT[outcome.code]());
      return;
    }
    facilities.refresh();
    mode.close();
  };

  const landBlocked = landAllowed === false;
  // 알박기 땅(D-572): 지을 수 있지만 다른 세력 영토 안 — 지키지 못하면 빼앗길 수 있다고 알린다
  const landClaim =
    land.data?.status === "ready" && land.data.allowed && (land.data.territoryFaction ?? null) !== null;
  return (
    <section
      className="map-panel map-units map-build"
      aria-labelledby="map-build-title"
      data-phase={chosen ? "place" : "list"}
      data-valid={chosen ? String(valid) : undefined}
      data-land={landAllowed === null ? "unknown" : landAllowed ? "allowed" : "blocked"}
      data-operator={operator ? "on" : undefined}
    >
      <div className="map-units-head">
        <h2 id="map-build-title" className="map-units-title">
          {chosen ? pickName(chosen.name, chosen.id) : m.build_title()}
        </h2>
        <button
          type="button"
          className="button-small map-units-close map-build-close"
          onClick={() => mode.close()}
        >
          {m.build_close()}
        </button>
      </div>
      {landBlocked ? (
        <p className="map-build-warning" role="alert">
          {m.build_problem_foreign_city()}
        </p>
      ) : landClaim ? (
        <p className="map-units-note map-build-claim">{m.build_land_claim_note()}</p>
      ) : null}
      {operator ? <p className="map-units-note map-build-operator">{m.build_operator_note()}</p> : null}
      {!data ? (
        <p className="map-units-note">{m.shell_loading()}</p>
      ) : !chosen ? (
        buildable.length === 0 ? (
          <p className="map-units-note">{m.build_none()}</p>
        ) : (
          <>
            <p className="map-units-note">{m.build_pick_hint()}</p>
            <ul className="map-build-list">
              {buildable.map((entry) => {
                const first = entry.levels[0];
                const size = entry.footprint;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="map-build-option"
                      data-facility={entry.id}
                      aria-disabled={entry.exchangeLock ? "true" : undefined}
                      onClick={() => {
                        // 잠긴 거래소(유닛·증권, D-561)는 고르지 않는다 — 까닭은 아래 줄
                        if (!entry.exchangeLock) mode.choose(entry.id);
                      }}
                    >
                      <span className="map-build-option-name">{pickName(entry.name, entry.id)}</span>
                      <span className="map-build-option-meta">
                        {size ? m.build_size({ w: size.width, d: size.height }) : null}
                        {first ? ` · ${formatDuration(first.timeMs)}` : null}
                        {entry.gatherRadiusCells
                          ? ` · ${m.build_radius_short({ cells: entry.gatherRadiusCells })}`
                          : null}
                      </span>
                      {first ? (
                        <span className="map-build-option-meta">
                          {stacksText(data, stock, first.materials)}
                        </span>
                      ) : null}
                      {entry.exchangeLock ? (
                        <span className="map-build-option-meta" data-part="build-locked">
                          {entry.exchangeLock === "after_launch"
                            ? m.build_exchange_after_launch()
                            : m.build_exchange_not_ready()}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )
      ) : (
        <div className="map-build-body">
          <p
            className="map-build-status"
            role="status"
            data-problem={problems.length === 0 ? "none" : problems.join(" ")}
          >
            {problems.length === 0
              ? m.build_ready()
              : problems.map((problem) => PROBLEM_TEXT[problem]()).join(" · ")}
          </p>
          {claim !== null ? (
            <p className="map-units-note" data-part="build-claim" data-claim={claim}>
              {CLAIM_TEXT[claim]()}
            </p>
          ) : null}
          {claimLocked !== null ? (
            <p className="map-units-note" data-part="build-claim-locked" data-locked={claimLocked}>
              {claimLocked === "vassal" ? m.build_claim_locked_vassal() : m.build_claim_locked_independent()}
            </p>
          ) : null}
          {choosing ? (
            <fieldset className="map-build-claim-choice" data-part="build-claim-choice" data-mode={claimMode}>
              <legend className="map-units-note">{m.build_claim_mode_label()}</legend>
              <div className="map-build-claim-options">
                {(["nation", "independent"] as const).map((option) => (
                  <label key={option} className="map-build-claim-option">
                    <input
                      type="radio"
                      name="map-build-claim-mode"
                      value={option}
                      checked={claimMode === option}
                      onChange={() => setClaimMode(option)}
                    />
                    <span>{CLAIM_MODE_TEXT[option]()}</span>
                  </label>
                ))}
              </div>
              {claimMode === "independent" ? (
                claim === "personal" ? (
                  <p className="map-units-note">{m.build_claim_personal_regime()}</p>
                ) : (
                  <label className="map-build-claim-option">
                    <span>{m.build_claim_regime_label()}</span>
                    <select
                      className="input"
                      value={claimRegime}
                      onChange={(event) => {
                        const next = LAND_CLAIM_REGIMES.find((value) => value === event.target.value);
                        if (next) setClaimRegime(next);
                      }}
                    >
                      {LAND_CLAIM_REGIMES.map((value) => (
                        <option key={value} value={value}>
                          {CLAIM_REGIME_TEXT[value]()}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              ) : (
                <p className="map-units-note">{m.build_claim_mode_note()}</p>
              )}
            </fieldset>
          ) : null}
          {level1 ? (
            <p className="map-units-note">
              {stacksText(data, stock, level1.materials)} · {formatDuration(level1.timeMs)}
            </p>
          ) : null}
          {footprint ? (
            <p className="map-units-note">
              {m.build_size({
                w: rotatedSize(footprint.width, footprint.height, state.rotation).sx,
                d: rotatedSize(footprint.width, footprint.height, state.rotation).sy,
              })}{" "}
              · {worker ? m.build_builder({ id: worker.id }) : m.build_builder_none()}
            </p>
          ) : null}
          {radius !== null && radius > 0 ? (
            <p className="map-units-note" data-part="build-radius">
              {m.build_radius({ cells: radius })}
            </p>
          ) : null}
          {notice ? (
            <p className="map-build-warning" role="alert">
              {notice}
            </p>
          ) : null}
          <div className="map-build-actions">
            <button type="button" className="button-small map-build-rotate" onClick={() => mode.rotate()}>
              {m.build_rotate()}
            </button>
            <button type="button" className="button-small map-build-change" onClick={() => mode.choose(null)}>
              {m.build_change()}
            </button>
            <button
              type="button"
              className="button-small button-primary map-build-confirm"
              disabled={!valid || sending}
              onClick={() => void send()}
            >
              {m.build_confirm()}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
