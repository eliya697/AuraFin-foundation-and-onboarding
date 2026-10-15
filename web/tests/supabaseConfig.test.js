import { describe, expect, test } from 'vitest';
import { supabaseConfigProblem } from '../src/services/backend/config.js';

const keyFor = (ref) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ iss: 'supabase', ref, role: 'anon' })).replace(/=+$/, '')}.sig`;

describe('supabaseConfigProblem', () => {
  test('accepts a URL that matches the key', () => {
    expect(supabaseConfigProblem('https://abcdefghijklmnopqrst.supabase.co', keyFor('abcdefghijklmnopqrst'))).toBeNull();
  });

  test('catches a typo in the project URL (the GitHub Pages ERR_FAILED bug)', () => {
    const problem = supabaseConfigProblem('https://rkxiqueubvgiacaerqafj.supabase.co', keyFor('rkxiqeubvgiacaerqafj'));
    expect(problem).toMatch(/rkxiqueubvgiacaerqafj.*rkxiqeubvgiacaerqafj/);
  });

  test('rejects malformed and insecure URLs', () => {
    expect(supabaseConfigProblem('rkxiqeubvgiacaerqafj.supabase.co', keyFor('x'))).toMatch(/not a valid URL/);
    expect(supabaseConfigProblem('http://abc.supabase.co', keyFor('abc'))).toMatch(/https/);
  });

  test('does not guess for keys without an embedded project ref', () => {
    expect(supabaseConfigProblem('https://abc.supabase.co', 'sb_publishable_123')).toBeNull();
  });
});
