import assert from 'node:assert/strict';
import test from 'node:test';
import {
  shouldShowExternalLoginOptions,
  shouldShowExternalLoginWarning,
  getProfileModalGridClass,
  getProfileGuestBadgeLabel,
  getLoginUiVisibility,
} from '../src/game/buildMode';

test('shouldShowExternalLoginOptions enables external login options so users can log in and save', () => {
  assert.equal(shouldShowExternalLoginOptions(), true);
});

test('External login warning visibility behavior', () => {
  assert.equal(shouldShowExternalLoginWarning(false), true);
  assert.equal(shouldShowExternalLoginWarning(true), false);
});

test('getProfileGuestBadgeLabel outputs correct badge label', () => {
  assert.equal(getProfileGuestBadgeLabel(false), 'Guest');
  assert.equal(getProfileGuestBadgeLabel(true), 'Logged In');
});

test('getProfileModalGridClass outputs responsive 2-column layout', () => {
  assert.equal(getProfileModalGridClass(true, false), 'mt-4 grid gap-2 sm:grid-cols-2');
  assert.equal(getProfileModalGridClass(false, false), 'mt-4 grid gap-2 grid-cols-1');
});

test('getLoginUiVisibility enables login and create account options with 2-column layout', () => {
  // Guest user:
  // Login options, Create Account button, and email login form are visible.
  // Profile modal grid renders in 2 columns (Save + Log In), with Create Account below.
  const guestUi = getLoginUiVisibility(false);
  assert.equal(guestUi.showExternalLoginOptions, true, 'External login options must be visible');
  assert.equal(guestUi.showCreateAccountButton, true, 'Create Account button must be visible');
  assert.equal(guestUi.showEmailLoginForm, true, 'Email login form must be enabled');
  assert.equal(guestUi.showExternalLoginWarning, true, 'Login warning banner visible for guests');
  assert.equal(guestUi.guestBadgeLabel, 'Guest', 'Badge must indicate Guest');
  assert.equal(guestUi.profileGridClass, 'mt-4 grid gap-2 sm:grid-cols-2', 'Modal grid must be 2 columns for Save + Log In');

  // Logged-in user:
  const loggedInUi = getLoginUiVisibility(true);
  assert.equal(loggedInUi.showCreateAccountButton, false);
  assert.equal(loggedInUi.showEmailLoginForm, false);
  assert.equal(loggedInUi.showExternalLoginWarning, false);
  assert.equal(loggedInUi.guestBadgeLabel, 'Logged In');
  assert.equal(loggedInUi.profileGridClass, 'mt-4 grid gap-2 sm:grid-cols-2');
});
