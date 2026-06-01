import { Capacitor } from "@capacitor/core";

// Custom URL scheme registered in AndroidManifest.xml. Supabase redirects back
// into the app through this scheme after OAuth / password-reset.
export const APP_SCHEME = "com.rashmi.ppl";
export const OAUTH_CALLBACK = `${APP_SCHEME}://login-callback`;
export const RESET_CALLBACK = `${APP_SCHEME}://reset`;

export const isNative = (): boolean => Capacitor.isNativePlatform();

// Where Supabase should send the user back to after auth.
// - Web: the current origin (Vercel / localhost dev).
// - Native: a custom-scheme deep link the OS routes back into the app.
export function oauthRedirect(): string {
  return isNative() ? OAUTH_CALLBACK : window.location.origin;
}

export function resetRedirect(): string {
  return isNative() ? RESET_CALLBACK : `${window.location.origin}/reset`;
}
