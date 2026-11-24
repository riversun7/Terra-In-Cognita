// 가문 창설·가입 명령(WebSocket house_found → house_result, 프로토콜 22 / house_invite·house_apply·house_answer·house_withdraw·house_leave·
// house_kick → house_member_result, 프로토콜 23 / house_handover·house_dissolve → house_member_result, house_village·house_ruin →
// house_city_result, 프로토콜 24 / house_recruit_auto·house_recruit_hire → house_recruit_result, 프로토콜 25 / house_home → house_member_result,
// house_found cityId, 프로토콜 39 — D-565 / house_entry_policy → house_member_result, 프로토콜 50 — 질문 2018) — 보내고 같은 요청 번호의 답을 기다린다.
// 질문 926 나·985 다, docs/adr/2026-11-11-faction-identity.md "바뀜 (926~935 답)"·"바뀜 (981~986 답)". 게임 상태를 바꾸는 명령은 WebSocket으로만.
// 국적 바꾸기 명령(government/naturalizeCommands.ts)과 같은 틀이다: 인사 전이면 기다렸다 보내고, 끊기면 "offline", TIMEOUT_MS 안에 답이 없으면 "timeout".
import type {
  CityJoinApprover,
  HouseCityMode,
  HouseCityTaxSetter,
  HouseEntryScope,
  HouseCityResultCode,
  HouseMemberAction,
  HouseMemberResultCode,
  HouseRecruitPayer,
  HouseRecruitResultCode,
  HouseRegime,
  HouseResultCode,
  ServerMessage,
} from "@terra/protocol";
import { type FeatureClientMessage, type ServerLink, serverLink } from "../../net/serverLink.ts";

export type HouseOutcome =
  | { readonly ok: true; readonly factionId: number; readonly paid: string }
  | { readonly ok: false; readonly code: HouseResultCode | "offline" | "timeout" };

export type HouseMemberOutcome =
  | { readonly ok: true; readonly action: HouseMemberAction; readonly factionId: number }
  | { readonly ok: false; readonly code: HouseMemberResultCode | "offline" | "timeout" };

/** 가입 명령(요청 번호는 여기서 붙인다) */
export type HouseMemberRequest =
  | { readonly t: "house_invite"; readonly name: string }
  | { readonly t: "house_apply"; readonly factionId: number }
  | { readonly t: "house_answer"; readonly requestId: number; readonly accept: boolean }
  | { readonly t: "house_withdraw"; readonly requestId: number }
  | { readonly t: "house_leave" }
  | { readonly t: "house_kick"; readonly userId: string }
  // 프로토콜 24(질문 1003 가)
  | { readonly t: "house_handover"; readonly userId: string }
  // 프로토콜 62(질문 2491 — D-588 5): 가문장이 후계자를 정하거나(userId) 푼다(null)
  | { readonly t: "house_heir"; readonly userId: string | null }
  | { readonly t: "house_dissolve" }
  // 프로토콜 39(D-565): 가문장이 소속 도시를 바꾼다
  | { readonly t: "house_home"; readonly cityId: number }
  // 프로토콜 50(질문 2018 답): 도시 주인·독립 나라 가문장이 가문 이동 정책(+ 가입비 / − 지원금, null = 정하지 않음)을 정한다
  | {
      readonly t: "house_entry_policy";
      readonly scope: HouseEntryScope;
      readonly cityId?: number;
      readonly fee: string | null;
    }
  // 프로토콜 54(D-574 2150·2124): 가문 금고 기부(가문원)·가문세율(가문장, ‰)·도시 짓기 정책(도시를 가진 가문의 가문장, null = 기본값)
  | { readonly t: "house_donate"; readonly amount: string }
  | { readonly t: "house_vault_take"; readonly amount: string }
  | { readonly t: "house_tax"; readonly ratePm: number }
  | { readonly t: "house_build_policy"; readonly cityId: number; readonly allow: boolean | null }
  | { readonly t: "house_foreign_build_policy"; readonly cityId: number; readonly allow: boolean | null }
  // 프로토콜 70(2단계): 정부 방문 도시 가입 신청·승인·정책·탈퇴·추방·블랙리스트
  | { readonly t: "house_city_apply"; readonly buildingId: number }
  | { readonly t: "house_city_decide"; readonly applicationId: number; readonly accept: boolean }
  | {
      readonly t: "house_join_policy";
      readonly cityId: number;
      readonly approver: CityJoinApprover | null;
      readonly minStanding: number | null;
    }
  | { readonly t: "house_city_leave" }
  | { readonly t: "house_city_expel"; readonly cityId: number; readonly houseId: number }
  | {
      readonly t: "nation_blacklist";
      readonly action: "add" | "remove";
      readonly cityId: number;
      readonly targetName?: string;
      readonly targetUserId?: string;
      readonly bounty?: string;
      readonly reason?: string;
    }
  // 프로토콜 71(3단계): 가문 도시세 정책 설정·체납 빚 납부
  | {
      readonly t: "house_city_tax_policy";
      readonly cityId: number;
      readonly amount: string | null;
      readonly periodDays: number | null;
      readonly setter: HouseCityTaxSetter | null;
    }
  | { readonly t: "house_city_tax_pay" };

export type HouseCityOutcome =
  | {
      readonly ok: true;
      readonly factionId: number;
      readonly mode: HouseCityMode;
      readonly cityId: number;
      readonly paid: string;
    }
  | { readonly ok: false; readonly code: HouseCityResultCode | "offline" | "timeout" };

/** 가문 도시 명령(프로토콜 24, 질문 1005 가): 마을 세우기 | 폐허를 가문 도시로 */
export type HouseCityRequest =
  | {
      readonly t: "house_village";
      readonly mapKey: number;
      readonly x: number;
      readonly y: number;
      readonly cost: string;
      readonly mode: HouseCityMode;
      readonly regime?: HouseRegime;
    }
  | {
      readonly t: "house_ruin";
      readonly ruinId: number;
      readonly mode: HouseCityMode;
      readonly regime?: HouseRegime;
    }
  /** 봉신 가문 독립 선언(프로토콜 53, D-575) */
  | { readonly t: "house_independence"; readonly regime: HouseRegime };

export type HouseRecruitOutcome =
  | { readonly ok: true; readonly auto: boolean; readonly payer?: HouseRecruitPayer | undefined }
  | { readonly ok: false; readonly code: HouseRecruitResultCode | "offline" | "timeout" };

/** 가문 도시 구인 명령(프로토콜 25, 질문 1041 다): 자동 켬·끔 | 카드 한 장 사기(본 창·자리·값) */
export type HouseRecruitRequest =
  | { readonly t: "house_recruit_auto"; readonly on: boolean }
  | {
      readonly t: "house_recruit_hire";
      readonly cityId: number;
      readonly window: number;
      readonly slot: number;
      readonly cost: string;
    };

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 메시지 하나를 보내고 read가 값을 돌려주는 첫 답을 기다린다(끊김 = offline, 보낸 뒤 시간 넘김 = timeout) */
export function request<T>(
  link: ServerLink,
  build: (id: number) => FeatureClientMessage,
  read: (message: ServerMessage, id: number) => T | null,
  lost: (code: "offline" | "timeout") => T,
): Promise<T> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: T): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop();
      resolve(outcome);
    };
    const trySend = (): void => {
      if (sent || !link.isReady()) return;
      sent = link.send(build(id));
    };
    stop = link.listen((event) => {
      if (event.kind === "ready") trySend();
      else if (event.kind === "down" && sent) finish(lost("offline"));
      else if (event.kind === "message") {
        const outcome = read(event.message, id);
        if (outcome !== null) finish(outcome);
      }
    });
    timer = setTimeout(() => finish(lost(sent ? "timeout" : "offline")), TIMEOUT_MS);
    trySend();
  });
}

/**
 * 창설 명령 하나를 보내고 결과를 기다린다. 창설은 무료(D-565 — cost는 옛 서버 호환으로 "0"을 보낸다). cityId = 고른 가문 소속 도시(없으면 서버가
 * 내 사이보그의 내 도시로)
 */
export function sendHouseFound(cityId: number | null, link: ServerLink = serverLink): Promise<HouseOutcome> {
  return request<HouseOutcome>(
    link,
    (id) => ({ t: "house_found", id, cost: "0", ...(cityId === null ? {} : { cityId }) }),
    (message, id) => {
      if (message.t !== "house_result" || message.id !== id) return null;
      return message.ok
        ? { ok: true, factionId: message.factionId, paid: message.paid }
        : { ok: false, code: message.code };
    },
    (code) => ({ ok: false, code }),
  );
}

/** 가문 도시 명령 하나를 보내고 결과를 기다린다 */
export function sendHouseCity(
  body: HouseCityRequest,
  link: ServerLink = serverLink,
): Promise<HouseCityOutcome> {
  return request<HouseCityOutcome>(
    link,
    (id) => ({ ...body, id }),
    (message, id) => {
      if (message.t !== "house_city_result" || message.id !== id) return null;
      return message.ok
        ? {
            ok: true,
            factionId: message.factionId,
            mode: message.mode,
            cityId: message.cityId,
            paid: message.paid,
          }
        : { ok: false, code: message.code };
    },
    (code) => ({ ok: false, code }),
  );
}

/** 가문 도시 구인 명령 하나를 보내고 결과를 기다린다 */
export function sendHouseRecruit(
  body: HouseRecruitRequest,
  link: ServerLink = serverLink,
): Promise<HouseRecruitOutcome> {
  return request<HouseRecruitOutcome>(
    link,
    (id) => ({ ...body, id }),
    (message, id) => {
      if (message.t !== "house_recruit_result" || message.id !== id) return null;
      return message.ok
        ? { ok: true, auto: message.auto, payer: message.payer }
        : { ok: false, code: message.code };
    },
    (code) => ({ ok: false, code }),
  );
}

/** 가입 명령 하나를 보내고 결과를 기다린다 */
export function sendHouseMember(
  body: HouseMemberRequest,
  link: ServerLink = serverLink,
): Promise<HouseMemberOutcome> {
  return request<HouseMemberOutcome>(
    link,
    (id) => ({ ...body, id }),
    (message, id) => {
      if (message.t !== "house_member_result" || message.id !== id) return null;
      return message.ok
        ? { ok: true, action: message.action, factionId: message.factionId }
        : { ok: false, code: message.code };
    },
    (code) => ({ ok: false, code }),
  );
}
