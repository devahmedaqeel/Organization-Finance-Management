import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNativeGoogleCallback, parseNativeGoogleCallback, validateNativeGoogleRedirect, normalizeGoogleRole, isGoogleBridgePath, isGooglePopupCancellation, googleAuthErrorMessage, withAuthTimeout } from "../googleAuthFlow";

const redirect = "ofm-app://login";

test("native callback preserves credentials and the chosen role without double decoding", () => {
  const url = buildNativeGoogleCallback(redirect, { idToken: "id.+/%25", accessToken: "access+/%2B" }, "manager", "request-123");
  assert.deepEqual(parseNativeGoogleCallback(url, redirect, "request-123"), { idToken: "id.+/%25", accessToken: "access+/%2B", role: "manager" });
});
test("Firebase credentials may contain only an ID token or only an access token", () => {
  for (const tokens of [{ idToken: "id" }, { accessToken: "access" }]) {
    assert.ok(parseNativeGoogleCallback(buildNativeGoogleCallback(redirect, tokens, "admin", "s"), redirect, "s"));
  }
  assert.throws(() => buildNativeGoogleCallback(redirect, {}, "admin", "s"), /credential/);
});
test("callbacks cannot send Google credentials to another website or app", () => {
  for (const target of ["https://example.com/login", "other-app://login", "ofm-app://other", "ofm-app://login?redirect=https://example.com", "ofm-app://login#fragment", "ofm-app://user:password@login"]) {
    assert.throws(() => validateNativeGoogleRedirect(target), /callback/);
  }
});
test("native results must match the pending request state and callback route", () => {
  const good = buildNativeGoogleCallback(redirect, { idToken: "id" }, "employee", "pending");
  for (const url of [good.replace("pending", "other"), good.replace("ofm-app:", "https:"), good.replace("login", "other"), good.replace("login", "user@login"), good.replace("login", "login:123"), good.replace("&state=pending", ""), good + "#fragment"]) {
    assert.throws(() => parseNativeGoogleCallback(url, redirect, "pending"), /verify/);
  }
  assert.throws(() => parseNativeGoogleCallback(good, redirect, ""), /verify/);
});
test("only the exact Google bridge route owns native redirect results", () => {
  assert.equal(isGoogleBridgePath("/auth/google"), true);
  assert.equal(isGoogleBridgePath("/auth/google/"), true);
  for (const route of ["/", "/login", "/auth/google-other"]) assert.equal(isGoogleBridgePath(route), false);
});
test("cancelled popups are distinct from configuration and network failures", () => {
  assert.equal(isGooglePopupCancellation({ code: "auth/popup-closed-by-user" }), true);
  assert.equal(isGooglePopupCancellation({ code: "auth/cancelled-popup-request" }), true);
  assert.equal(isGooglePopupCancellation({ code: "auth/network-request-failed" }), false);
  assert.match(googleAuthErrorMessage({ code: "auth/unauthorized-domain" }), /Firebase/);
  assert.match(googleAuthErrorMessage({ code: "auth/network-request-failed" }), /internet/);
});
test("invalid roles cannot create unsupported account roles", () => {
  for (const role of [null, "owner", "superadmin", ""]) assert.equal(normalizeGoogleRole(role), "admin");
  assert.equal(normalizeGoogleRole("accountant"), "accountant");
});
test("profile deadlines reject a stalled lookup and preserve early results and failures", async () => {
  assert.equal(await withAuthTimeout(Promise.resolve("profile"), 100, "timed out"), "profile");
  await assert.rejects(withAuthTimeout(Promise.reject(new Error("lookup failed")), 100, "timed out"), /lookup failed/);
  await assert.rejects(withAuthTimeout(new Promise(() => {}), 5, "timed out"), /timed out/);
});
