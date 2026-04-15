const REPORT_KEYWORDS = [
  "relatório diário",
  "relatorio diario",
  "relatório semanal",
  "relatorio semanal",
  "segue o nosso relatório",
  "segue nosso relatório",
  "segue o relatório",
  "captação – facebook",
  "captacao – facebook",
  "captação - facebook",
  "captacao - facebook",
  "lead em contato",
  "leads novos",
  "sem retorno",
  "sem interesse",
  "agendamentos do dia",
  "conversas iniciadas",
  "custo por conversa",
  "valor investido",
  "investimento:",
  "impressões:",
  "impressoes:",
  "alcance:",
  "cliques:",
  "período:",
  "periodo:",
];

const TERMINAL_ACK_PATTERNS = [
  /^(?:ok(?:ay)?|certo|fechado|combinado|perfeito|show|top|valeu|obrigad[oa]|blz|beleza|resolvido|joia|jóia|👍+|👍🏻+|👍🏽+|👍🏿+|🙏+|❤️+|ok obrigado|ok obrigada|show obrigado|show obrigada)[!.\s]*$/i,
  /^(?:👍|👍🏻|👍🏽|👍🏿|👏|🙏|❤️|✅|ok){1,4}$/i,
];

const SELF_RESOLVED_PATTERNS = [
  /^(?:ok[,.!\s]+)?vou\s+(?:fazer|pagar|realizar|resolver)\s+(?:isso\s+)?aqui[!.\s]*$/i,
  /^(?:ok[,.!\s]+)?vou\s+ver(?:ificar)?\s+aqui[!.\s]*$/i,
  /^(?:ja|já)\s+estou\s+aqui[!.\s]*$/i,
  /^(?:deixa|deixa que eu)\s+(?:comigo|eu\s+(?:vejo|verifico|resolvo)\s+aqui)[!.\s]*$/i,
];

function normalizeText(text: string | null | undefined) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function stripTrailingSignature(text: string) {
  return text.replace(/[!.\s]+[a-z]{1,2}$/i, "").trim();
}

export function getEffectiveMessageTime(createdAt: string, receivedAt?: string | null) {
  return receivedAt && receivedAt > createdAt ? receivedAt : createdAt;
}

export function isInformationalReport(text: string | null | undefined) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  const matches = REPORT_KEYWORDS.filter((keyword) => normalized.includes(keyword)).length;
  return matches >= 2 || (normalized.includes("relatorio") && normalized.includes("lead"));
}

export function isTerminalAcknowledgement(text: string | null | undefined) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  const sanitized = stripTrailingSignature(normalized);
  return TERMINAL_ACK_PATTERNS.some((pattern) => pattern.test(normalized) || pattern.test(sanitized))
    || SELF_RESOLVED_PATTERNS.some((pattern) => pattern.test(normalized) || pattern.test(sanitized));
}

export function requiresResponse(text: string | null | undefined) {
  return !isInformationalReport(text) && !isTerminalAcknowledgement(text);
}

export function businessMinutesSince(isoTime: string, businessStartHour = 8, businessEndHour = 18.5) {
  const now = new Date();
  return businessMinutesBetween(isoTime, now.toISOString(), businessStartHour, businessEndHour);
}

export function businessMinutesBetween(
  startIso: string,
  endIso: string,
  businessStartHour = 8,
  businessEndHour = 18.5,
) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (end <= start) return 0;

  const toBrt = (date: Date) => new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const startBrt = toBrt(start);
  const endBrt = toBrt(end);

  const clamp = (date: Date) => {
    const cloned = new Date(date);
    while (cloned.getDay() === 0 || cloned.getDay() === 6) {
      cloned.setDate(cloned.getDate() + 1);
      cloned.setHours(Math.floor(businessStartHour), businessStartHour % 1 ? 30 : 0, 0, 0);
    }

    const hour = cloned.getHours() + cloned.getMinutes() / 60;
    if (hour < businessStartHour) {
      cloned.setHours(Math.floor(businessStartHour), businessStartHour % 1 ? 30 : 0, 0, 0);
    } else if (hour >= businessEndHour) {
      cloned.setDate(cloned.getDate() + 1);
      cloned.setHours(Math.floor(businessStartHour), businessStartHour % 1 ? 30 : 0, 0, 0);
      while (cloned.getDay() === 0 || cloned.getDay() === 6) {
        cloned.setDate(cloned.getDate() + 1);
      }
    }

    return cloned;
  };

  const current = clamp(startBrt);
  if (current >= endBrt) return 0;

  let total = 0;
  while (current < endBrt) {
    if (current.getDay() !== 0 && current.getDay() !== 6) {
      const endOfBusiness = new Date(current);
      endOfBusiness.setHours(Math.floor(businessEndHour), businessEndHour % 1 ? 30 : 0, 0, 0);
      const sliceEnd = endBrt < endOfBusiness ? endBrt : endOfBusiness;
      if (sliceEnd > current) {
        total += (sliceEnd.getTime() - current.getTime()) / 60000;
      }
    }

    current.setDate(current.getDate() + 1);
    current.setHours(Math.floor(businessStartHour), businessStartHour % 1 ? 30 : 0, 0, 0);
    while (current.getDay() === 0 || current.getDay() === 6) {
      current.setDate(current.getDate() + 1);
    }
  }

  return Math.max(0, Math.round(total));
}