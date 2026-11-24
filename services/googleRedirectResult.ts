import { getRedirectResult, type Auth } from "firebase/auth";

// Firebase redirect credentials must be consumed once, even when effects remount.
const results = new WeakMap<Auth, ReturnType<typeof getRedirectResult>>();
export function getGoogleRedirectResult(auth: Auth) {
  let result = results.get(auth);
  if (!result) { result = getRedirectResult(auth); results.set(auth, result); }
  return result;
}
