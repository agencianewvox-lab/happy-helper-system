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
  /^(?:ok(?:ay)?|certo|fechado|combinado|perfeito|show|top|valeu|obrigad[oa]|blz|beleza|resolvido|joia|jóia|massa|dahora|demais|sensacional|maravilh[oa]|excelente|incrivel|arrasou|mandou bem|muito bom|bom demais|👍+|👍🏻+|👍🏽+|👍🏿+|🙏+|❤️+|ok obrigado|ok obrigada|show obrigado|show obrigada)[!.\s]*$/i,
  /^(?:👍|👍🏻|👍🏽|👍🏿|👏|🙏|❤️|✅|🔥|ok){1,4}$/i,
  // Compound positive reactions: "top bom demais", "show de bola", "perfeito demais", etc.
  /^(?:top|show|perfeito|massa|sensacional|excelente|maravilh[oa]|incrivel|arrasou|muito bom|bom)\s+(?:demais|dms|bom demais|bom dms|de\s*bola|de\s*mais|hein|viu|d\+)[!.\s]*$/i,
  /^top\s+bom\s+(?:demais|dms|d\+)[!.\s]*$/i,
  // Positive reaction to content: "top bom demais", "ficou top", "ficou show", "ficou lindo", etc.
  /^(?:ficou|ta|tá|está)\s+(?:top|show|perfeito|lindo|massa|demais|sensacional|excelente|maravilhos[oa]|incrivel|otimo|ótimo|bom demais)[!.\s]*$/i,
  // Short positive phrases that clearly don't need a response
  /^(?:amei|adorei|curti|gostei|aprovado|aprovei|manda ver|pode ser|isso ai|isso aí|boa|boaa+|ótimo|otimo|muito bom|bom demais|top demais)[!.\s]*$/i,
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

export function calculateSlaStatus(
  actionableWaitingSince: string | null | undefined,
  thresholdMinutes = 30,
  businessStartHour = 8,
  businessEndHour = 18.5,
) {
  if (!actionableWaitingSince) {
    return {
      violated: false,
      delayMinutes: 0,
      elapsedMinutes: 0,
    };
  }

  const elapsedMinutes = businessMinutesSince(
    actionableWaitingSince,
    businessStartHour,
    businessEndHour,
  );

  return {
    violated: elapsedMinutes >= thresholdMinutes,
    delayMinutes: Math.max(0, elapsedMinutes - thresholdMinutes),
    elapsedMinutes,
  };
}

export function businessMinutesBetween(
  startIso: string,
  endIso: string,
  businessStartHour = 8,
  businessEndHour = 18.5,
) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return 0;

  // Shift once to Brasília's current UTC-3 offset; UTC accessors avoid applying the host timezone twice.
  const toBrt = (date: Date) => new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const startBrt = toBrt(start);
  const endBrt = toBrt(end);

  const clamp = (date: Date) => {
    const cloned = new Date(date);
    while (cloned.getUTCDay() === 0 || cloned.getUTCDay() === 6) {
      cloned.setUTCDate(cloned.getUTCDate() + 1);
      cloned.setUTCHours(Math.floor(businessStartHour), businessStartHour % 1 ? 30 : 0, 0, 0);
    }

    const hour = cloned.getUTCHours() + cloned.getUTCMinutes() / 60;
    if (hour < businessStartHour) {
      cloned.setUTCHours(Math.floor(businessStartHour), businessStartHour % 1 ? 30 : 0, 0, 0);
    } else if (hour >= businessEndHour) {
      cloned.setUTCDate(cloned.getUTCDate() + 1);
      cloned.setUTCHours(Math.floor(businessStartHour), businessStartHour % 1 ? 30 : 0, 0, 0);
      while (cloned.getUTCDay() === 0 || cloned.getUTCDay() === 6) {
        cloned.setUTCDate(cloned.getUTCDate() + 1);
      }
    }

    return cloned;
  };

  const current = clamp(startBrt);
  if (current >= endBrt) return 0;

  let total = 0;
  while (current < endBrt) {
    if (current.getUTCDay() !== 0 && current.getUTCDay() !== 6) {
      const endOfBusiness = new Date(current);
      endOfBusiness.setUTCHours(Math.floor(businessEndHour), businessEndHour % 1 ? 30 : 0, 0, 0);
      const sliceEnd = endBrt < endOfBusiness ? endBrt : endOfBusiness;
      if (sliceEnd > current) {
        total += (sliceEnd.getTime() - current.getTime()) / 60000;
      }
    }

    current.setUTCDate(current.getUTCDate() + 1);
    current.setUTCHours(Math.floor(businessStartHour), businessStartHour % 1 ? 30 : 0, 0, 0);
    while (current.getUTCDay() === 0 || current.getUTCDay() === 6) {
      current.setUTCDate(current.getUTCDate() + 1);
    }
  }

  return Math.max(0, Math.round(total));
}
