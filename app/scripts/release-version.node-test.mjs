import test from "node:test";
import assert from "node:assert/strict";
import { isPrerelease, selectReleaseVersion } from "./release-version.mjs";

test("an exact alpha version is preserved without incrementing its prerelease", () => {
  assert.equal(selectReleaseVersion({ requested: "0.1.0-alpha", current: "0.1.0-alpha" }), "0.1.0-alpha");
  assert.equal(isPrerelease("0.1.0-alpha"), true);
});

test("a later patch advances the numeric core from a prerelease", () => {
  assert.equal(selectReleaseVersion({ current: "0.1.0-alpha", latest: "v0.1.0-alpha", bump: "patch" }), "0.1.1");
});

test("a clean release reset uses package metadata, ignoring historic tags", () => {
  assert.equal(selectReleaseVersion({ current: "0.1.0-alpha", latest: "", bump: "patch" }), "0.1.0-alpha");
});

test("manual versions accept stable SemVer and reject malformed input", () => {
  assert.equal(selectReleaseVersion({ requested: "1.0.0", current: "0.1.0-alpha" }), "1.0.0");
  assert.equal(selectReleaseVersion({ requested: "0.1.0-alpha.1", current: "0.1.0-alpha" }), "0.1.0-alpha.1");
  assert.throws(() => selectReleaseVersion({ requested: "v01.0.0", current: "0.1.0-alpha" }), /Invalid requested/);
});
