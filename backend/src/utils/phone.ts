/**
 * ── One phone number, one spelling ───────────────────────────────────────
 *
 * "Is this customer already in the system?" is only answerable if the same
 * number is always stored the same way. It was not: seeded customers carry
 * `+919820000001` while the billing screen recorded walk-ins as `9998887771`,
 * so an equality lookup could never match them and the shop would accumulate a
 * second record for every regular who once walked in.
 *
 * Everything is therefore canonicalised to `+91XXXXXXXXXX` on write. The shop
 * is a single Gujarat counter, so a bare 10-digit number means India; a value
 * that does not look like an Indian mobile is passed through digits-only
 * rather than mangled into a wrong number.
 */
export function normalisePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');

  // 10-digit Indian mobile: 9998887771
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  // With the country code, with or without a +: 919998887771
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  // Some other country, already written internationally.
  if (trimmed.startsWith('+') && digits.length >= 11 && digits.length <= 15) return `+${digits}`;

  /**
   * Everything else keeps its digits, unrewritten — including a leading zero.
   *
   * `0` + ten digits is deliberately NOT read as a mobile, because it is
   * ambiguous and this shop sits on the wrong side of the ambiguity:
   * `079-26578899` is an ordinary Ahmedabad landline, and `09998887771` is a
   * mobile written with the old trunk prefix. Both are eleven digits, both
   * start `0` followed by 6–9, and nothing in the string distinguishes them.
   * Guessing "mobile" would turn the shop's local landlines into valid-looking
   * numbers belonging to strangers, and a wrong number is far worse than an
   * unmatched one. `phoneLookupCandidates` covers the mobile reading at
   * lookup time, where a bad guess costs nothing.
   */
  return digits || trimmed;
}

/**
 * Every spelling a stored number might plausibly have, for matching only.
 *
 * Storage commits to one canonical form; lookup is allowed to be generous,
 * because the cost of an extra candidate is a miss that finds nothing, while
 * the cost of a missed candidate is a duplicate customer record.
 */
export function phoneLookupCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  const candidates = new Set([normalisePhone(trimmed), trimmed, digits]);

  // The reading `normalisePhone` refused to commit to: a mobile typed with a
  // leading trunk zero. Safe here — worst case it matches nothing.
  if (/^0[6-9]\d{9}$/.test(digits)) candidates.add(`+91${digits.slice(1)}`);
  // And the reverse: a stored bare-10-digit row predating canonicalisation.
  if (/^\+91[6-9]\d{9}$/.test(normalisePhone(trimmed))) candidates.add(normalisePhone(trimmed).slice(3));

  return [...candidates].filter(Boolean);
}

/** True when two numbers are the same line, however they were typed. */
export const samePhone = (a: string, b: string): boolean => {
  if (normalisePhone(a) === normalisePhone(b)) return true;
  const shared = phoneLookupCandidates(a).filter((c) => phoneLookupCandidates(b).includes(c));
  return shared.length > 0;
};

/**
 * wa.me needs a bare international number: no +, no spaces, no dashes.
 *
 * Numbers are entered locally, as 10 digits, so a 10-digit value gets India's
 * 91. Anything else is passed through digits-only — a number already stored
 * with its country code stays correct, and a malformed one produces a link
 * that visibly fails rather than one that silently reaches a stranger.
 */
export function toWhatsAppNumber(phone: string): string {
  return normalisePhone(phone).replace(/\D/g, '');
}

/** `https://wa.me/<number>?text=<message>` — click-to-chat, no API account. */
export function whatsAppLink(phone: string, message: string): string {
  return `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(message)}`;
}
