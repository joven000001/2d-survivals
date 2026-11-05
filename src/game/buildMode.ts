/**
 * UI Visibility and authentication layout configuration.
 * Controls guest mode, account creation, and login visibility.
 */

/**
 * Determines whether external login options (Create Account, Sign In with Email, Google Sign-In)
 * should be displayed. Always true for standalone web gameplay so users can log in, create accounts,
 * or save their profiles across sessions.
 */
export function shouldShowExternalLoginOptions(): boolean {
  return true;
}

/**
 * Determines whether the unauthenticated login warning banner should be displayed.
 */
export function shouldShowExternalLoginWarning(hasAccountUser: boolean): boolean {
  return !hasAccountUser;
}

/**
 * Helper to determine CSS grid layout for the profile dialog buttons.
 */
export function getProfileModalGridClass(showExternalLogin = true, hasAccountUser = false): string {
  return showExternalLogin || hasAccountUser ? 'mt-4 grid gap-2 sm:grid-cols-2' : 'mt-4 grid gap-2 grid-cols-1';
}

/**
 * Helper to determine the badge text on the title screen profile card.
 */
export function getProfileGuestBadgeLabel(hasAccountUser: boolean): string {
  return hasAccountUser ? 'Logged In' : 'Guest';
}

export interface LoginUiVisibility {
  showExternalLoginOptions: boolean;
  showCreateAccountButton: boolean;
  showEmailLoginForm: boolean;
  showExternalLoginWarning: boolean;
  guestBadgeLabel: string;
  profileGridClass: string;
}

/**
 * Consolidated visibility state for all login, account creation, and profile UI elements.
 */
export function getLoginUiVisibility(hasAccountUser: boolean): LoginUiVisibility {
  const showExternalLogin = shouldShowExternalLoginOptions();
  return {
    showExternalLoginOptions: showExternalLogin,
    showCreateAccountButton: showExternalLogin && !hasAccountUser,
    showEmailLoginForm: showExternalLogin && !hasAccountUser,
    showExternalLoginWarning: shouldShowExternalLoginWarning(hasAccountUser),
    guestBadgeLabel: getProfileGuestBadgeLabel(hasAccountUser),
    profileGridClass: getProfileModalGridClass(showExternalLogin, hasAccountUser),
  };
}
