// 1차맵 명령 판 — 볼 수 없는 2차맵 도시의 [정찰 보내기]가 여는 1차맵 명령 흐름(기획 60 §4.2 D-6019 "대상 → 명령 → 파티 → 확인 → 확정").
// docs/adr/2026-11-07-play-flow.md "WP7", 기획 정리 D-518 513 "볼 수 없는 2차맵 들어가기 = 시야 규칙 + 1차맵 명령 흐름".
// [임시] 서버에 2차맵 사이를 오가는 명령(D-197 "명령하면 유닛은 실제 2차맵을 지나간다")이 아직 없다: 대상·명령·보낼 유닛까지 보이고 [확정]은
// 막아 둔 채 까닭을 알린다(확인 대기, 질문 571). 그 명령이 생기면 [확정]이 WebSocket 명령을 보낸다(상태를 바꾸는 명령은 WebSocket, AGENTS 4장).
// 거리는 내 사이보그 자리에서 도시 시청까지 큰 원 거리(보기 값, 판정에 쓰지 않는다).
import type { WorldMapCity, WorldMapFaction } from "@terra/shared/worldMap";
import { useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { cityLabel, factionColor } from "./worldMapData.ts";

/** 1차맵 명령(D-6019의 이동·공격·운송·정찰 가운데 지금 보이는 둘) */
export type WorldOrder = "scout" | "move";

interface PlanetCommandPanelProps {
  readonly city: WorldMapCity;
  readonly factions: readonly WorldMapFaction[];
  /** 내 사이보그 자리(없으면 보낼 유닛 없음) */
  readonly me: { readonly latDeg: number; readonly lonDeg: number } | null;
  /** 행성 반지름(m, 거리 셈). 모르면 null */
  readonly radiusM: number | null;
  readonly onClose: () => void;
}

const RAD = Math.PI / 180;

/** 두 위도·경도(°) 사이 큰 원 거리(km, 반지름 radiusM) */
export function greatCircleKm(
  a: { readonly latDeg: number; readonly lonDeg: number },
  b: { readonly latDeg: number; readonly lonDeg: number },
  radiusM: number,
): number {
  const dLat = (b.latDeg - a.latDeg) * RAD;
  const dLon = (b.lonDeg - a.lonDeg) * RAD;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a.latDeg * RAD) * Math.cos(b.latDeg * RAD) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return (2 * radiusM * Math.asin(Math.min(1, Math.sqrt(h)))) / 1000;
}

export function PlanetCommandPanel({ city, factions, me, radiusM, onClose }: PlanetCommandPanelProps) {
  const titleId = useId();
  const noteId = useId();
  const [order, setOrder] = useState<WorldOrder>("scout");
  const km = me && radiusM ? greatCircleKm(me, city, radiusM) : null;
  const distance =
    km === null
      ? null
      : new Intl.NumberFormat(getLocale(), { maximumFractionDigits: km < 10 ? 1 : 0 }).format(km);
  return (
    <section
      className="map-panel planet-city planet-command"
      aria-labelledby={titleId}
      data-city={city.id}
      data-order={order}
      data-nation={factionColor(factions, city.factionId)}
    >
      <div className="planet-city-head">
        <span className="planet-city-dot" aria-hidden="true" />
        <h2 id={titleId} className="planet-city-name">
          {m.world_command_title()}
        </h2>
      </div>
      <p className="planet-city-nation">{m.world_command_target({ target: cityLabel(factions, city) })}</p>
      <div className="planet-segment" role="group" aria-label={m.world_command_kind_label()}>
        <button
          type="button"
          className="button-small"
          aria-pressed={order === "scout"}
          onClick={() => setOrder("scout")}
        >
          {m.world_command_scout()}
        </button>
        <button
          type="button"
          className="button-small"
          aria-pressed={order === "move"}
          onClick={() => setOrder("move")}
        >
          {m.world_command_move()}
        </button>
      </div>
      <p className="planet-city-nation">
        {me
          ? distance === null
            ? m.world_command_party_cyborg()
            : m.world_command_party_cyborg_far({ km: distance })
          : m.world_command_party_none()}
      </p>
      <div className="planet-city-actions">
        <p id={noteId} className="planet-city-note">
          {m.world_command_unavailable()}
        </p>
        <button
          type="button"
          className="button-small button-primary planet-command-confirm"
          disabled
          aria-describedby={noteId}
        >
          {m.world_command_confirm()}
        </button>
        <button type="button" className="button-small" onClick={onClose}>
          {m.world_city_close()}
        </button>
      </div>
    </section>
  );
}
