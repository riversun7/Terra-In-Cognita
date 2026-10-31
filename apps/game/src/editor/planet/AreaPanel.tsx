// 면적 판 — 평면 미니맵, 공개본 ↔ 초안 번갈아 보기, 바이옴 면적표와 차이 열, 아래 줄(ADR 38 8절, 사용자 D1)
// - 보기(초안·공개본)는 지구본·미니맵·칸 정보창이 함께 따른다(부모가 든다).
// - 면적표는 지금 보는 쪽이 아니라 늘 초안 본 결과 기준이고, 차이 열은 같은 면 레벨의 공개본 결과와 견준다(editorView areaRows).
//   무거운 레벨(F8·F9)의 공개본 본 결과는 청할 때만 만든다 → [공개본도 F9로 만들기](F9는 부모가 확인 창을 띄운다).
// - 값은 면적 가중 요약(워커의 summarizePlanet)이다. 머리에 "미리보기 F7 기준, 굽기 F9와 다를 수 있음"을 적는다.
import { type PlanetSummary, VERTICAL_SCALE } from "@terra/planet/generator";
import { useId } from "react";
import { m } from "../../paraglide/messages.js";
import { FlatMap } from "./FlatMap.tsx";
import { formatNumber, formatShare, formatShareDiff, localName } from "./editorMessages.ts";
import type { AreaRow } from "./editorView.ts";
import type { LatLon } from "./flatMapRender.ts";
import type { PreviewEntry } from "./previewTypes.ts";

export type ShownRole = "draft" | "base";

export interface AreaPanelProps {
  readonly shown: ShownRole;
  readonly onShow: (role: ShownRole) => void;
  readonly mapEntry: PreviewEntry | null;
  readonly biomeColors: readonly number[];
  readonly picked: LatLon | null;
  readonly onPick: (point: LatLon) => void;
  /** 초안 본 결과 요약(없으면 계산 중) */
  readonly summary: PlanetSummary | null;
  /** 해수면(실제 m) — 요약과 같은 결과 */
  readonly seaLevelRealM: number | null;
  readonly rows: readonly AreaRow[];
  /** 바이옴 표 번호 → 바이옴 항목(이름) */
  readonly biomeEntries: readonly unknown[];
  /** 공개본 비교 결과가 없고 청할 수 있으면 그 레벨 */
  readonly baseMissingLevel: number | null;
  readonly onMakeBase: () => void;
}

function biomeName(entries: readonly unknown[], index: number, id: string): string {
  const entry = entries[index];
  const name: unknown = typeof entry === "object" && entry !== null ? Reflect.get(entry, "name") : null;
  return localName(name, id);
}

/** 바이옴 색 0xRRGGBB → 인라인 색(자료 값: 콘텐츠 팩 바이옴 색. 화면 CSS의 토큰 규칙 밖이다) */
function swatch(colour: number | undefined): string {
  return colour === undefined ? "transparent" : `#${colour.toString(16).padStart(6, "0")}`;
}

export function AreaPanel(props: AreaPanelProps) {
  const { summary, rows } = props;
  const captionId = useId();
  const mapLabel =
    props.shown === "draft"
      ? `${m.planet_editor_flat_map_label()} · ${m.planet_editor_role_draft()}`
      : `${m.planet_editor_flat_map_label()} · ${m.planet_editor_role_base()}`;
  return (
    <div className="pe-stack">
      <div className="pe-segment" role="group" aria-label={m.planet_editor_show()}>
        {(["draft", "base"] as const).map((role) => (
          <button
            key={role}
            type="button"
            className="button-small"
            aria-pressed={props.shown === role}
            data-role={role}
            onClick={() => props.onShow(role)}
          >
            {role === "draft" ? m.planet_editor_role_draft() : m.planet_editor_role_base()}
          </button>
        ))}
      </div>
      <FlatMap
        fields={props.mapEntry?.result.fields ?? null}
        biomeColors={props.biomeColors}
        selected={props.picked}
        onPick={props.onPick}
        label={mapLabel}
      />
      {summary ? (
        <>
          <div className="pe-table-wrap">
            <table className="pe-table pe-area-table" aria-describedby={captionId}>
              <caption id={captionId} className="pe-caption">
                {m.planet_editor_area_caption({ level: String(summary.faceLevel) })}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{m.planet_editor_col_biome()}</th>
                  <th scope="col" className="pe-num">
                    {m.planet_editor_col_planet()}
                  </th>
                  <th scope="col" className="pe-num">
                    {m.planet_editor_col_land()}
                  </th>
                  <th scope="col" className="pe-num">
                    {m.planet_editor_col_diff()}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} data-biome={row.id}>
                    <th scope="row">
                      <span
                        className="pe-swatch"
                        aria-hidden="true"
                        style={{ backgroundColor: swatch(props.biomeColors[row.index]) }}
                      />
                      {biomeName(props.biomeEntries, row.index, row.id)}
                    </th>
                    <td className="pe-num">{formatShare(row.planetShare)}</td>
                    <td className="pe-num">{row.landShare === null ? "–" : formatShare(row.landShare)}</td>
                    <td
                      className="pe-num"
                      data-diff={row.diff === null ? "" : Math.sign(Math.round(row.diff * 1000))}
                    >
                      {row.diff === null ? "–" : formatShareDiff(row.diff)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {props.baseMissingLevel !== null ? (
            <div className="pe-note">
              <p className="field-hint">
                {m.planet_editor_area_no_base({ level: String(props.baseMissingLevel) })}
              </p>
              <button type="button" className="button-small" onClick={props.onMakeBase}>
                {m.planet_editor_make_base({ level: String(props.baseMissingLevel) })}
              </button>
            </div>
          ) : null}
          <dl className="pe-facts">
            <div>
              <dt>{m.planet_editor_sum_land()}</dt>
              <dd>{formatShare(summary.landShare)}</dd>
            </div>
            <div>
              <dt>{m.planet_editor_sum_lake()}</dt>
              <dd>{formatShare(summary.lakeShare)}</dd>
            </div>
            <div>
              <dt>{m.planet_editor_sum_river()}</dt>
              <dd>{formatShare(summary.riverShare)}</dd>
            </div>
            <div>
              <dt>{m.planet_editor_sum_ocean_coastal()}</dt>
              <dd>{formatShare(summary.oceanDepthShares.coastal)}</dd>
            </div>
            <div>
              <dt>{m.planet_editor_sum_ocean_shelf()}</dt>
              <dd>{formatShare(summary.oceanDepthShares.shelf)}</dd>
            </div>
            <div>
              <dt>{m.planet_editor_sum_ocean_deep()}</dt>
              <dd>{formatShare(summary.oceanDepthShares.deep)}</dd>
            </div>
            <div>
              <dt>{m.planet_editor_sum_mean_temperature()}</dt>
              <dd>{m.planet_editor_value_celsius({ value: formatNumber(summary.meanTemperatureC, 1) })}</dd>
            </div>
            {props.seaLevelRealM !== null ? (
              <div>
                <dt>{m.planet_editor_sum_sea_level()}</dt>
                <dd>{m.planet_editor_value_meters({ value: formatNumber(props.seaLevelRealM) })}</dd>
              </div>
            ) : null}
            <div>
              <dt>{m.planet_editor_sum_highest()}</dt>
              <dd>
                {m.planet_editor_value_meters({
                  value: formatNumber(summary.maxElevationM * VERTICAL_SCALE),
                })}
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="status" role="status">
          {m.planet_editor_area_waiting()}
        </p>
      )}
    </div>
  );
}
