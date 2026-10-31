// 우편 시안 자료 — dev·admin이 우편 화면을 볼 때 쓰는 보기 전용 자료(ADR 37 6절 "시안 자료", D-439). 받기·보내기에 쓰지 않는다.
// - 기획 46 §10.2(D-270): 유저끼리 물건과 세력 화폐를 보낸다. 유닛·테라코인·계정 귀속 물건은 없다.
// - 유저 글(제목·본문)은 원문 그대로다(D-6046): 한국어로 쓴 우편과 영어로 쓴 우편이 섞여 있다(다른 언어면 [번역] 단추).
// - 사람 이름·세력 화폐 이름은 사람이 지은 이름이라 두 언어에서 같은 글자다. 물건 이름은 콘텐츠 이름처럼 두 언어다.
// - 세력 화면 시안 장면(src/factionScreen/preview.ts)과 같은 사람·세력이다. ID는 preview_로 시작한다.
import type { MailAttachable, MailItem } from "@terra/shared/mail";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 시안 장면의 "나"(받는 사람) */
const ME = { name: "Aster", factionTag: "SOL" } as const;

const IRON_ORE = { ko: "철광석", en: "Iron ore" } as const;
const FIELD_RATION = { ko: "야전 식량", en: "Field ration" } as const;

/** 받은·보낸 우편(새것부터 정렬은 list.ts가 한다) */
export function previewMailItems(now: number): MailItem[] {
  return [
    {
      id: "preview_mail_1",
      folder: "inbox",
      from: { name: "Mora", factionTag: "SOL" },
      to: ME,
      subject: "Nova 창고 정리했어요",
      body: "남는 철광석 보내요. 공성 준비에 쓰세요!\n세율 투표는 저도 반대에 넣었어요.",
      lang: "ko",
      sentAt: now - 40 * MINUTE,
      read: false,
      attachments: [{ kind: "item", item: "preview_iron_ore", label: IRON_ORE, quantity: 40 }],
      claimed: false,
      preview: true,
    },
    {
      id: "preview_mail_2",
      folder: "inbox",
      from: { name: "Rook", factionTag: "KSL" },
      to: ME,
      subject: "Re: siege on Saltmarsh",
      body: "We're in. Sending some Kestrel marks for repairs — our squads arrive an hour before the siege window.",
      lang: "en",
      sentAt: now - 3 * HOUR,
      read: false,
      attachments: [
        { kind: "currency", currency: "preview_kestrel_mark", name: "Kestrel mark", amount: "2000" },
      ],
      claimed: false,
      preview: true,
    },
    {
      id: "preview_mail_3",
      folder: "inbox",
      from: { name: "Pell", factionTag: "SOL" },
      to: ME,
      subject: "Vega 방어 시각 상의",
      body: "Ashen Pact가 명분 없이 선포했어요. 방어 시각은 내일 저녁이 좋겠습니다.",
      lang: "ko",
      sentAt: now - 1 * DAY - 2 * HOUR,
      read: true,
      attachments: [],
      claimed: false,
      preview: true,
    },
    {
      id: "preview_mail_4",
      folder: "inbox",
      from: { name: "Juniper", factionTag: null },
      to: ME,
      subject: "Thanks for the escort",
      body: "Rations as promised. Safe roads!",
      lang: "en",
      sentAt: now - 4 * DAY,
      read: true,
      attachments: [{ kind: "item", item: "preview_field_ration", label: FIELD_RATION, quantity: 12 }],
      claimed: true,
      preview: true,
    },
    {
      id: "preview_mail_5",
      folder: "sent",
      from: ME,
      to: { name: "Mora", factionTag: "SOL" },
      subject: "Nova 예산",
      body: "이번 주 예산 한도를 조금 올렸어요. 성장 방침 그대로 가요.",
      lang: "ko",
      sentAt: now - 2 * HOUR,
      read: true,
      attachments: [{ kind: "currency", currency: "preview_sol_mark", name: "Sol", amount: "1000" }],
      claimed: true,
      preview: true,
    },
    {
      id: "preview_mail_6",
      folder: "sent",
      from: ME,
      to: { name: "Rook", factionTag: "KSL" },
      subject: "Siege window",
      body: "Siege on Saltmarsh opens in about a day. Can Kestrel join?",
      lang: "en",
      sentAt: now - 1 * DAY,
      read: false,
      attachments: [],
      claimed: false,
      preview: true,
    },
  ];
}

/** 쓰기 칸에서 고를 수 있는 첨부(시안: 내가 가진 물건 둘, 세력 화폐 하나) */
export function previewAttachables(): MailAttachable[] {
  return [
    { kind: "item", key: "preview_iron_ore", label: IRON_ORE, max: "260" },
    { kind: "item", key: "preview_field_ration", label: FIELD_RATION, max: "48" },
    { kind: "currency", key: "preview_sol_mark", name: "Sol", max: "35000" },
  ];
}
