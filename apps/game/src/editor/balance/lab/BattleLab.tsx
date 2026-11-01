// [전투 실험실] 탭 — docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)".
// 팀 A·B(파티 하나씩, 최대 6명)를 꾸리고 고른 유닛을 고치며(서버 미리 보기가 따라옴), 전투장에서 한 판·몬테카를로를 서버에 맡긴다.
// 넓은 화면: 왼쪽 = 팀 둘 + 전투장, 오른쪽 = 유닛 편집 + 미리 보기. 좁은 화면(390px)은 한 줄로 쌓는다.
// 시험용 data-*: .bl-lab data-status(loading·ready·failed).
import type {
  LabBattleResponse,
  LabMonteCarloResponse,
  LabPreviewResponse,
  LabUnit,
} from "@terra/shared/battleLab";
import { decodeBattleReplay, replayFromBase64 } from "@terra/protocol/battleReplay";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadReplayGround } from "../../../battle/replayTerrain.ts";
import { refreshSession } from "../../../auth/session.ts";
import { api } from "../../../net/api.ts";
import { m } from "../../../paraglide/messages.js";
import { LiveMessage, useLiveLines } from "../../../ui/LiveMessage.tsx";
import { type ArenaSettings, ArenaPanel } from "./ArenaPanel.tsx";
import { type Selection, clampSelection, isLabUnitShape, labErrorOf, updateUnit } from "./labModel.ts";
import { labErrorText } from "./labMessages.ts";
import { ReplayOverlay, type WatchedBattle } from "./ReplayOverlay.tsx";
import { TeamPanel } from "./TeamPanel.tsx";
import { UnitEditor } from "./UnitEditor.tsx";
import { UnitPreview } from "./UnitPreview.tsx";
import type { LabData } from "./useLabData.ts";

/** 유닛을 고친 뒤 미리 보기를 다시 묻기까지(ms) — 칸을 잇달아 고칠 때 요청을 줄인다 */
const PREVIEW_DELAY_MS = 300;

export function BattleLab({ data, locale }: { data: LabData; locale: string }) {
  const { load, teams, setTeams, presets } = data;
  const [picked, setPicked] = useState<Selection>({ team: "a", index: 0 });
  const [preview, setPreview] = useState<{ key: string; result: LabPreviewResponse } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ArenaSettings>({
    terrain: "flat",
    limitSec: 120,
    seed: 1,
    runs: 20,
  });
  const [busy, setBusy] = useState<"battle" | "monte" | "watch" | null>(null);
  const [watched, setWatched] = useState<WatchedBattle | null>(null);
  const [battle, setBattle] = useState<{ result: LabBattleResponse; key: string } | null>(null);
  const [monte, setMonte] = useState<{ result: LabMonteCarloResponse; key: string } | null>(null);
  const notice = useLiveLines();
  const noticeError = useLiveLines();
  const problem = useLiveLines();
  const previewSeq = useRef(0);

  const selected = clampSelection(teams, picked);
  const unit: LabUnit | undefined = teams[selected.team].units[selected.index];
  const unitKey = `${selected.team.toUpperCase()}${selected.index + 1}`;
  // 미리 보기 지문: 유닛 값이 바뀔 때만 다시 묻는다
  const unitJson = useMemo(() => (unit ? JSON.stringify(unit) : ""), [unit]);
  const ready = load.status === "ready";

  useEffect(() => {
    if (!ready || unitJson === "") return undefined;
    const seq = previewSeq.current + 1;
    previewSeq.current = seq;
    const timer = setTimeout(() => {
      // 지문은 이 화면이 만든 유닛 JSON 그대로다(서버가 다시 검사한다)
      const input: unknown = JSON.parse(unitJson);
      if (!isLabUnitShape(input)) return;
      api.battleLab.preview.query(input).then(
        (result) => {
          if (previewSeq.current !== seq) return;
          setPreview({ key: unitJson, result });
          setPreviewError(null);
        },
        (error: unknown) => {
          if (previewSeq.current !== seq) return;
          const info = labErrorOf(error);
          if (info.sessionEnded) void refreshSession();
          setPreviewError(labErrorText(info.key));
        },
      );
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready, unitJson]);

  const battleKey = JSON.stringify([teams, settings.terrain, settings.limitSec, settings.seed]);
  const monteKey = JSON.stringify([teams, settings]);

  const onNotice = (line: string, tone: "success" | "error"): void => {
    if (tone === "success") {
      noticeError.clear();
      notice.show([line]);
    } else {
      notice.clear();
      noticeError.show([line]);
    }
  };

  const fail = (error: unknown): void => {
    const info = labErrorOf(error);
    if (info.sessionEnded) void refreshSession();
    problem.show([labErrorText(info.key)]);
  };

  const runBattle = (): void => {
    if (busy) return;
    setBusy("battle");
    problem.clear();
    const key = battleKey;
    api.battleLab.battle
      .mutate({
        a: teams.a,
        b: teams.b,
        terrain: settings.terrain,
        limitSec: settings.limitSec,
        seed: settings.seed,
      })
      .then((result) => setBattle({ result, key }), fail)
      .finally(() => setBusy(null));
  };

  /** 3D 관람: 서버가 같은 시드의 한 판을 리플레이로 기록 → 경기장 지형을 받아 보기 창을 연다 */
  const runWatch = (): void => {
    if (busy) return;
    setBusy("watch");
    problem.clear();
    api.battleLab.replay
      .mutate({
        a: teams.a,
        b: teams.b,
        terrain: settings.terrain,
        limitSec: settings.limitSec,
        seed: settings.seed,
      })
      .then(async (result) => {
        const replay = decodeBattleReplay(replayFromBase64(result.replay));
        const ground = await loadReplayGround(replay.arena);
        setWatched({ replay, ground });
      }, fail)
      .catch(fail)
      .finally(() => setBusy(null));
  };

  const runMonte = (): void => {
    if (busy) return;
    setBusy("monte");
    problem.clear();
    const key = monteKey;
    api.battleLab.monteCarlo
      .mutate({ a: teams.a, b: teams.b, ...settings })
      .then((result) => setMonte({ result, key }), fail)
      .finally(() => setBusy(null));
  };

  if (load.status === "loading")
    return (
      <div className="bl-lab" data-status="loading">
        <p className="field-hint">{m.dev_balance_loading()}</p>
      </div>
    );
  if (load.status === "failed")
    return (
      <div className="bl-lab bp-failed" data-status="failed">
        <p role="alert" className="field-error">
          {labErrorText(load.error.key)}
        </p>
        <button type="button" className="button-small" onClick={data.reload}>
          {m.dev_balance_retry()}
        </button>
      </div>
    );
  const { catalog } = load;
  return (
    <div className="bl-lab" data-status="ready" data-revision={catalog.revision}>
      <ReplayOverlay watched={watched} onClose={() => setWatched(null)} />
      <p className="lead bp-lead">{m.dev_lab_lead()}</p>
      <ul className="bp-summary" aria-label={m.dev_balance_summary_label()}>
        <li>{m.dev_balance_pack({ version: catalog.contentVersion })}</li>
        <li>{m.dev_balance_revision({ revision: catalog.revision })}</li>
        <li>{m.dev_lab_growth_chip({ growth: catalog.growth.growthPm, max: catalog.growth.maxLevel })}</li>
        {presets && presets.invalid > 0 ? (
          <li className="bl-invalid">{m.dev_lab_presets_invalid({ count: presets.invalid })}</li>
        ) : null}
      </ul>
      <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
      <LiveMessage tone="error" lines={noticeError.lines} version={noticeError.version} />
      <div className="bl-layout">
        <div className="bl-col">
          {(["a", "b"] as const).map((team) => (
            <TeamPanel
              key={team}
              team={team}
              teams={teams}
              setTeams={setTeams}
              selected={selected}
              onSelect={setPicked}
              catalog={catalog}
              presets={presets}
              onPresets={data.setPresets}
              onNotice={onNotice}
              locale={locale}
            />
          ))}
          <ArenaPanel
            catalog={catalog}
            settings={settings}
            onSettings={setSettings}
            busy={busy}
            onBattle={runBattle}
            onMonte={runMonte}
            onWatch={runWatch}
            battle={battle ? { result: battle.result, stale: battle.key !== battleKey } : null}
            monte={monte ? { result: monte.result, stale: monte.key !== monteKey } : null}
            problem={problem}
            teams={teams}
            locale={locale}
          />
        </div>
        <div className="bl-col">
          {unit ? (
            <UnitEditor
              key={unitKey}
              unit={unit}
              unitKey={unitKey}
              catalog={catalog}
              presets={presets}
              locale={locale}
              onChange={(change) => setTeams((current) => updateUnit(current, selected, change))}
              onPresets={data.setPresets}
              onNotice={onNotice}
            />
          ) : null}
          <UnitPreview
            preview={preview?.result ?? null}
            error={previewError}
            stale={preview !== null && preview.key !== unitJson}
            catalog={catalog}
            locale={locale}
          />
        </div>
      </div>
    </div>
  );
}
