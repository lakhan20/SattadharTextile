import { describe, expect, it } from 'vitest';
import { normalisePhone, phoneLookupCandidates, samePhone, toWhatsAppNumber } from '../src/utils/phone';

/**
 * Duplicate customer records are created by *spelling*, not by intent: the
 * same person is `9998887771` on a walk-in bill and `+91 99988 87771` in the
 * customer master, and an equality lookup sees two people. Every case below is
 * a way a number actually turns up in this shop's data.
 */
describe('normalisePhone', () => {
  it('canonicalises every unambiguous way an Indian mobile gets typed', () => {
    const canonical = '+919998887771';
    for (const input of [
      '9998887771',
      '+919998887771',
      '919998887771',
      '99988 87771',
      '99988-87771',
      '+91 99988 87771',
      '  9998887771  ',
      '(999) 888-7771',
    ]) {
      expect(normalisePhone(input), input).toBe(canonical);
    }
  });

  it('treats the seeded and the walk-in spelling as the same line', () => {
    // Exactly the mismatch found in the database: seeded customers carried
    // +91…, billing recorded bare 10-digit numbers.
    expect(samePhone('+919820000001', '9820000001')).toBe(true);
    expect(samePhone('7359260186', '+91 73592 60186')).toBe(true);
  });

  it('keeps genuinely different numbers apart', () => {
    expect(samePhone('9998887771', '9998887772')).toBe(false);
    // Not a digit-suffix match: a shorter number is not "contained in" a longer one.
    expect(samePhone('8887771', '9998887771')).toBe(false);
  });

  it('passes through an already-international non-Indian number', () => {
    expect(normalisePhone('+1 415 555 0142')).toBe('+14155550142');
    expect(normalisePhone('+971509876543')).toBe('+971509876543');
  });

  it('does not invent a mobile out of something that is not one', () => {
    // 079-26578899 is an ordinary Ahmedabad landline — this shop's own STD
    // code. It is indistinguishable in shape from a mobile written with a
    // trunk zero, so nothing is stripped and no +91 is bolted on. Turning the
    // local landlines into strangers' mobile numbers is the worst outcome
    // available here.
    expect(normalisePhone('079-26578899')).toBe('07926578899');
    expect(normalisePhone('1800 123 4567')).toBe('18001234567');
    // 5 digits starting 9 is not a mobile either.
    expect(normalisePhone('99988')).toBe('99988');
  });

  it('still finds a mobile typed with a trunk zero, at lookup time', () => {
    // Storage refuses to guess; matching is allowed to try both readings,
    // because a wrong guess here costs a miss rather than a wrong number.
    expect(phoneLookupCandidates('09998887771')).toContain('+919998887771');
    expect(samePhone('09998887771', '+919998887771')).toBe(true);

    // And a row stored before canonicalisation is still reachable.
    expect(phoneLookupCandidates('+919998887771')).toContain('9998887771');
  });

  it('is idempotent — normalising twice changes nothing', () => {
    for (const input of ['9998887771', '+1 415 555 0142', '07926578899', 'not a phone']) {
      expect(normalisePhone(normalisePhone(input))).toBe(normalisePhone(input));
    }
  });
});

describe('toWhatsAppNumber', () => {
  it('produces a bare international number for wa.me', () => {
    expect(toWhatsAppNumber('9998887771')).toBe('919998887771');
    expect(toWhatsAppNumber('+91 99988 87771')).toBe('919998887771');
    expect(toWhatsAppNumber('+1 415 555 0142')).toBe('14155550142');
  });
});
