import { describe, it, expect } from 'vitest';
import { validateClientSide } from '../js/steps/pii.js';

const validPii = { first_name: 'Jean', last_name: 'Dupont', phone: '06 12 34 56 78' };

describe('validation PII côté front (confort, F4)', () => {
  it('accepts a valid national phone number', () => {
    expect(validateClientSide(validPii)).toBeNull();
  });

  it('accepts a valid +33 phone number', () => {
    expect(validateClientSide({ ...validPii, phone: '+33 6 12 34 56 78' })).toBeNull();
  });

  it('rejects an empty first name', () => {
    expect(validateClientSide({ ...validPii, first_name: '  ' })).toMatch(/Prénom/);
  });

  it('rejects an empty last name', () => {
    expect(validateClientSide({ ...validPii, last_name: '' })).toMatch(/Nom/);
  });

  it('rejects an invalid phone number', () => {
    expect(validateClientSide({ ...validPii, phone: '123' })).toMatch(/téléphone/);
  });
});
