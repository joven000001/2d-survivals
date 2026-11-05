export const LOBBY_CODE_LENGTH = 6;
export const LOBBY_CODE_MAX_LENGTH = 50;

export function sanitizeLobbyCode(raw: string): string {
  const digits = String(raw ?? '').replace(/\D+/g, '').slice(0, LOBBY_CODE_MAX_LENGTH);
  return digits;
}

export function normalizeLobbyCode(raw: string): string {
  return sanitizeLobbyCode(raw);
}

export function isValidLobbyCode(raw: string): boolean {
  return new RegExp(`^\\d{1,${LOBBY_CODE_MAX_LENGTH}}$`).test(String(raw ?? ''));
}

export function generateLobbyCode(exclusions: Iterable<string> = []): string {
  const blocked = new Set(Array.from(exclusions, (value) => String(value).trim()));
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = String(Math.floor(Math.random() * 1_000_000)).padStart(LOBBY_CODE_LENGTH, '0');
    if (!blocked.has(candidate)) return candidate;
  }
  for (let value = 0; value < 1_000_000; value += 1) {
    const candidate = String(value).padStart(LOBBY_CODE_LENGTH, '0');
    if (!blocked.has(candidate)) return candidate;
  }
  return '000000';
}

export interface ParsedInviteContext {
  roomId: string | null;
  isInstantMultiplayer: boolean;
  isValid: boolean;
  error?: string;
}

/**
 * Extracts and validates lobby join parameters from URL queries and invite parameters.
 */
export function parseInviteContext(
  searchParamsString: string = '',
  sdkInviteParams?: Record<string, string> | null,
  sdkIsInstant?: boolean
): ParsedInviteContext {
  const cleanSearch = searchParamsString.startsWith('?') ? searchParamsString.slice(1) : searchParamsString;
  const urlParams = new URLSearchParams(cleanSearch);

  const rawRoomId =
    sdkInviteParams?.roomId ||
    sdkInviteParams?.roomName ||
    sdkInviteParams?.lobby ||
    urlParams.get('roomId') ||
    urlParams.get('roomName') ||
    urlParams.get('lobby');

  const isInstant = Boolean(
    sdkIsInstant ||
    urlParams.get('instantJoin') === 'true' ||
    urlParams.get('instantMultiplayer') === 'true'
  );

  if (!rawRoomId) {
    return {
      roomId: null,
      isInstantMultiplayer: isInstant,
      isValid: true,
    };
  }

  const trimmed = rawRoomId.trim();
  const normalized = normalizeLobbyCode(trimmed);

  if (!normalized || !isValidLobbyCode(normalized) || normalized.length !== trimmed.length) {
    return {
      roomId: null,
      isInstantMultiplayer: isInstant,
      isValid: false,
      error: `Invalid invite code: "${trimmed}". Lobby codes must be numeric with up to ${LOBBY_CODE_MAX_LENGTH} digits.`,
    };
  }

  return {
    roomId: normalized,
    isInstantMultiplayer: isInstant,
    isValid: true,
  };
}
