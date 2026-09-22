import test from "node:test";
import assert from "node:assert/strict";
import {
  isModifiedNavigation,
  isRouteActive,
} from "../src/lib/navigation-state.ts";

test("root is active only on the root pathname", () => {
  assert.equal(isRouteActive("/", "/"), true);
  assert.equal(isRouteActive("/jobs", "/"), false);
});

test("dashboard links stay active on nested routes", () => {
  assert.equal(isRouteActive("/messages", "/messages"), true);
  assert.equal(isRouteActive("/messages/abc", "/messages"), true);
  assert.equal(isRouteActive("/profile/cv", "/profile"), true);
  assert.equal(isRouteActive("/profiles", "/profile"), false);
});

test("modified and non-primary clicks preserve native browser navigation", () => {
  assert.equal(
    isModifiedNavigation({
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    }),
    false,
  );
  assert.equal(
    isModifiedNavigation({
      button: 0,
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    }),
    true,
  );
  assert.equal(
    isModifiedNavigation({
      button: 1,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    }),
    true,
  );
});
