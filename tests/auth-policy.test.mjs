import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedGoogleSignIn } from "../lib/auth-policy.ts";

test("only verified Google email accounts can sign in", () => {
  const profile = { email: "player@example.com", email_verified: true };
  assert.equal(isAllowedGoogleSignIn("google", profile), true);
  for (const provider of [undefined, "credentials", "github", "email"]) {
    assert.equal(isAllowedGoogleSignIn(provider, profile), false);
  }
  for (const invalid of [null, undefined, {}, "google", { ...profile, email_verified: false },
    { ...profile, email_verified: "true" }, { ...profile, email: " " }]) {
    assert.equal(isAllowedGoogleSignIn("google", invalid), false);
  }
});