import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeLobbyCode,
  normalizeLobbyCode,
  isValidLobbyCode,
  parseInviteContext,
} from '../src/game/lobbyCodes';

test('sanitizeLobbyCode keeps only digits and trims to the maximum length', () => {
  assert.equal(sanitizeLobbyCode('ABC-123'), '123');
  assert.equal(sanitizeLobbyCode(' 12ab34 '), '1234');
  assert.equal(sanitizeLobbyCode('1234567'), '1234567');
  assert.equal(sanitizeLobbyCode('1'.repeat(51)), '1'.repeat(50));
  assert.equal(sanitizeLobbyCode('00123'), '00123');
});

test('normalizeLobbyCode preserves entered digits and rejects non-numeric input', () => {
  assert.equal(normalizeLobbyCode('123'), '123');
  assert.equal(normalizeLobbyCode('2345654'), '2345654');
  assert.equal(normalizeLobbyCode(' 000001 '), '000001');
  assert.equal(normalizeLobbyCode('ABC'), '');
  assert.equal(normalizeLobbyCode(''), '');
});

test('isValidLobbyCode accepts numeric codes up to 50 digits', () => {
  assert.equal(isValidLobbyCode('123456'), true);
  assert.equal(isValidLobbyCode('000001'), true);
  assert.equal(isValidLobbyCode('2345654'), true);
  assert.equal(isValidLobbyCode('1'.repeat(50)), true);
  assert.equal(isValidLobbyCode('ABC123'), false);
  assert.equal(isValidLobbyCode('123 456'), false);
  assert.equal(isValidLobbyCode('1'.repeat(51)), false);
});

test('parseInviteContext parses roomId from search query and SDK parameters', () => {
  const fromQuery = parseInviteContext('?roomId=123456');
  assert.equal(fromQuery.roomId, '123456');
  assert.equal(fromQuery.isValid, true);
  assert.equal(fromQuery.isInstantMultiplayer, false);

  const fromLobbyParam = parseInviteContext('?lobby=654321');
  assert.equal(fromLobbyParam.roomId, '654321');
  assert.equal(fromLobbyParam.isValid, true);

  const fromSdk = parseInviteContext('', { roomId: '998877' });
  assert.equal(fromSdk.roomId, '998877');
  assert.equal(fromSdk.isValid, true);

  const sdkOverridesQuery = parseInviteContext('?roomId=111111', { roomId: '222222' });
  assert.equal(sdkOverridesQuery.roomId, '222222');
});

test('parseInviteContext handles Instant Multiplayer flag and invalid codes safely', () => {
  const instantFromQuery = parseInviteContext('?instantMultiplayer=true');
  assert.equal(instantFromQuery.roomId, null);
  assert.equal(instantFromQuery.isInstantMultiplayer, true);
  assert.equal(instantFromQuery.isValid, true);

  const instantFromSdk = parseInviteContext('', null, true);
  assert.equal(instantFromSdk.isInstantMultiplayer, true);

  const invalidCode = parseInviteContext('?roomId=INVALID_CODE');
  assert.equal(invalidCode.roomId, null);
  assert.equal(invalidCode.isValid, false);
  assert.match(invalidCode.error ?? '', /Invalid invite code/);
});
