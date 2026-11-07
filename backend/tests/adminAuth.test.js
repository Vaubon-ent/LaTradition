import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { verifyPassword, generateToken, verifyToken, AdminAuthError } from '../src/services/adminAuth.js';

describe('adminAuth', () => {
  const hash = bcrypt.hashSync('correct-password', 4);

  it('verifyPassword accepte le bon mot de passe', () => {
    expect(verifyPassword('correct-password', hash)).toBe(true);
  });

  it('verifyPassword rejette un mauvais mot de passe', () => {
    expect(verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('verifyPassword rejette une valeur non-chaîne ou vide sans lever', () => {
    expect(verifyPassword(undefined, hash)).toBe(false);
    expect(verifyPassword('', hash)).toBe(false);
  });

  it('generateToken puis verifyToken : round-trip valide', () => {
    const token = generateToken('secret', 3600);
    const payload = verifyToken(token, 'secret');
    expect(payload.role).toBe('admin');
  });

  it('verifyToken rejette un mauvais secret', () => {
    const token = generateToken('secret', 3600);
    expect(() => verifyToken(token, 'wrong-secret')).toThrow(AdminAuthError);
  });

  it('verifyToken rejette un token expiré', () => {
    const token = generateToken('secret', -1);
    expect(() => verifyToken(token, 'secret')).toThrow(AdminAuthError);
  });

  it('verifyToken rejette un token manquant ou malformé', () => {
    expect(() => verifyToken(undefined, 'secret')).toThrow(AdminAuthError);
    expect(() => verifyToken('not-a-jwt', 'secret')).toThrow(AdminAuthError);
  });
});
