// 아래 판 채집 줄의 막대 둘 — 사용자 요청 2026-11-14 "채집시 진행바 ui표시".
// - 이번 캐기: 캐는 중일 때만. 서버가 준 시작·끝 시각으로 지금 몫을 구해 끝까지 CSS로 채운다(gatherProgress.ts).
//   이번 캐기가 바뀌면(key) 막대를 새로 만들어 처음부터 움직인다.
// - 화물: 지금 무게 / 상한(80kg 등). 자료가 올 때(몇 초마다) 바뀐다.
import type { GatherLoopView } from "@terra/shared/gather";
import type { CSSProperties } from "react";
import { m } from "../../paraglide/messages.js";
import { kgText } from "./gatherData.ts";
import { cargoFraction, digProgress } from "./gatherProgress.ts";

export function GatherMeters({ loop, now }: { readonly loop: GatherLoopView; readonly now: number }) {
  const dig = digProgress(loop, now);
  const cargo = cargoFraction(loop);
  const digStyle: CSSProperties | undefined = dig
    ? { animationDuration: `${Math.round(dig.totalMs)}ms`, animationDelay: `${-Math.round(dig.elapsedMs)}ms` }
    : undefined;
  const cargoStyle: CSSProperties = { transform: `scaleX(${cargo.toFixed(4)})` };
  return (
    <div className="gather-meters" data-dig={dig ? "on" : "off"}>
      {dig ? (
        <div className="gather-meter">
          <span className="gather-meter-label">
            <span>{m.gather_meter_dig()}</span>
            <span>{Math.ceil(dig.remainingMs / 1000)}s</span>
          </span>
          <span
            className="gather-dig-bar"
            role="progressbar"
            aria-label={m.gather_meter_dig()}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(dig.fraction * 100)}
          >
            <span key={dig.key} className="gather-dig-fill" style={digStyle} />
          </span>
        </div>
      ) : null}
      {loop.kindId !== null ? (
        <div className="gather-meter">
          <span className="gather-meter-label">
            <span>{m.gather_meter_cargo()}</span>
            <span>
              {kgText(loop.carriedGrams)}/{kgText(loop.capacityGrams)}kg
            </span>
          </span>
          <span
            className="gather-dig-bar"
            role="progressbar"
            aria-label={m.gather_meter_cargo()}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(cargo * 100)}
          >
            <span className="gather-cargo-fill" style={cargoStyle} />
          </span>
        </div>
      ) : null}
    </div>
  );
}
