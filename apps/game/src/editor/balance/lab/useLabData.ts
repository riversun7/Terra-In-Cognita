// 전투 실험실 자료(화면 틀이 들고 두 탭이 같이 쓴다) — 목록(battleLab.catalog)·프리셋(battleLab.presets)·두 팀.
// 팀은 이 기기에 남겨 두어(localStorage, 이 기기만) 새로 고쳐도 이어진다. 처음이면 프리셋을 받은 뒤 샘플 파티 둘로 채운다.
// 가중치 표 탭은 팀 A 유닛·유닛 프리셋을 기준 유닛으로 불러온다(서버 미리 보기로 1차 합을 받는다).
import type { LabCatalogResponse, LabPresetListResponse } from "@terra/shared/battleLab";
import { useCallback, useEffect, useRef, useState } from "react";
import { refreshSession } from "../../../auth/session.ts";
import { api } from "../../../net/api.ts";
import {
  type LabErrorInfo,
  type Teams,
  initialTeams,
  labErrorOf,
  loadTeams,
  looksLikeTeams,
  replaceParty,
  saveTeams,
} from "./labModel.ts";

export type LabLoad =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly catalog: LabCatalogResponse }
  | { readonly status: "failed"; readonly error: LabErrorInfo };

/** 처음 채우는 샘플 파티(팀 A·B) */
const FIRST_PARTIES = { a: "sample_party_lv30_mixed", b: "sample_party_creatures" } as const;

export interface LabData {
  readonly load: LabLoad;
  readonly presets: LabPresetListResponse | null;
  readonly teams: Teams;
  readonly setTeams: (change: (teams: Teams) => Teams) => void;
  readonly reload: () => void;
  readonly setPresets: (list: LabPresetListResponse) => void;
}

export function useLabData(): LabData {
  const [load, setLoad] = useState<LabLoad>({ status: "loading" });
  const [presets, setPresets] = useState<LabPresetListResponse | null>(null);
  // 기기에 남은 팀이 있으면 그것, 없으면 처음 팀(프리셋을 받으면 샘플로 바꾼다)
  const [stored] = useState(() => loadTeams(looksLikeTeams));
  const [teams, setTeamsState] = useState<Teams>(() => stored ?? initialTeams());
  const seeded = useRef(stored !== null);

  /** 목록·프리셋을 받는다(받는 동안의 상태는 부르는 쪽이 정한다) */
  const fetchAll = useCallback(() => {
    Promise.all([api.battleLab.catalog.query(), api.battleLab.presets.query()]).then(
      ([catalog, list]) => {
        setLoad({ status: "ready", catalog });
        setPresets(list);
        if (!seeded.current) {
          seeded.current = true;
          setTeamsState((current) => {
            let next = current;
            for (const team of ["a", "b"] as const) {
              const preset = list.presets.find((entry) => entry.id === FIRST_PARTIES[team]);
              if (preset?.kind === "party") next = replaceParty(next, team, preset.data);
            }
            return next;
          });
        }
      },
      (error: unknown) => {
        const info = labErrorOf(error);
        if (info.sessionEnded) void refreshSession();
        setLoad({ status: "failed", error: info });
      },
    );
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const reload = useCallback(() => {
    setLoad({ status: "loading" });
    fetchAll();
  }, [fetchAll]);

  const setTeams = useCallback((change: (teams: Teams) => Teams) => {
    setTeamsState((current) => {
      const next = change(current);
      if (next !== current) saveTeams(next);
      return next;
    });
  }, []);

  return { load, presets, teams, setTeams, reload, setPresets };
}
