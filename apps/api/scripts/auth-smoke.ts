/**
 * Sign-in and account checks against a running API on Supabase Auth.
 *   API_URL=http://localhost:4000 npx tsx scripts/auth-smoke.ts
 * Set API_LOG to the running API's log file to test password reset too: in
 * development the API prints reset codes there instead of emailing them.
 * Leaves one account behind (auth_…@example.com); delete it afterwards.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApiClient } from "@encore/shared";

const baseUrl = process.env.API_URL ?? "http://localhost:4000";
const client = () => {
  const box = { token: null as string | null };
  return { box, api: createApiClient({ baseUrl, getToken: () => box.token }) };
};
const status = (code: number) => (err: { status?: number }) => err.status === code;

const suffix = Math.random().toString(36).slice(2, 8);
const email = `auth_${suffix}@example.com`;
const username = `auth_${suffix}`;

// Two devices: the phone registers, the tablet signs in with the username in any case.
const phone = client();
const tablet = client();
const registered = await phone.api.auth.register({ email, username, password: "first-password" });
assert.ok(registered.refreshToken, "register returns a refresh token for the Supabase session");
phone.box.token = registered.token;
await assert.rejects(phone.api.auth.register({ email, username: `${username}x`, password: "first-password" }), status(409));
await assert.rejects(phone.api.auth.register({ email: `x${email}`, username: username.toUpperCase(), password: "first-password" }), status(409));
await assert.rejects(tablet.api.auth.login({ login: username, password: "wrong-password" }), status(401));
tablet.box.token = (await tablet.api.auth.login({ login: username.toUpperCase(), password: "first-password" })).token;
assert.equal((await tablet.api.auth.me()).user.email, email);
await assert.rejects(client().api.auth.me(), status(401));

// Changing the password keeps this device and signs out the other.
await assert.rejects(phone.api.account.changePassword({ currentPassword: "nope", newPassword: "second-password" }), status(403));
await phone.api.account.changePassword({ currentPassword: "first-password", newPassword: "second-password" });
assert.equal((await phone.api.auth.me()).user.username, username);
await assert.rejects(tablet.api.auth.me(), status(401));
await assert.rejects(tablet.api.auth.login({ login: email, password: "first-password" }), status(401));
tablet.box.token = (await tablet.api.auth.login({ login: email, password: "second-password" })).token;

// "Sign out other devices" does the same without a new password.
await phone.api.account.signOutOthers();
await phone.api.auth.me();
await assert.rejects(tablet.api.auth.me(), status(401));

// Forgot password: the same answer for unknown addresses, and the code signs out everywhere.
const apiLog = process.env.API_LOG;
let password = "second-password";
if (apiLog) {
  await phone.api.passwordReset.request({ email: `nobody_${suffix}@example.com` });
  await phone.api.passwordReset.request({ email });
  await new Promise((r) => setTimeout(r, 500));
  const mail = readFileSync(apiLog, "utf8").split(`[mail] to=${email} `).at(-1) ?? "";
  const code = mail.match(/password is (\d+)/)?.[1];
  assert.ok(code, "the reset code is in the API log");
  await assert.rejects(phone.api.passwordReset.confirm({ email, code: code === "000000" ? "111111" : "000000", password: "third-password" }), status(400));
  await phone.api.passwordReset.confirm({ email, code, password: "third-password" });
  await assert.rejects(phone.api.passwordReset.confirm({ email, code, password: "fourth-password" }), status(400), "a code works once");
  await assert.rejects(phone.api.auth.me(), status(401));
  password = "third-password";
  phone.box.token = (await phone.api.auth.login({ login: username, password })).token;
} else {
  console.log("password reset: skipped (set API_LOG to the API's log file)");
}

// Deleting the account needs the password, then the login and the session are gone.
await assert.rejects(phone.api.account.delete({ password: "nope" }), status(403));
await phone.api.account.delete({ password });
await assert.rejects(phone.api.auth.me(), status(401));
await assert.rejects(tablet.api.auth.login({ login: username, password }), status(401));
// The username and email are free again.
const again = await client().api.auth.register({ email, username, password: "fresh-password" });
assert.notEqual(again.user.id, registered.user.id);

console.log("auth smoke test passed ✔");
