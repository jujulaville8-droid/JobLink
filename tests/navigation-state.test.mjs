import test from "node:test";
import assert from "node:assert/strict";
import {
  getActiveHref,
  getActivePathname,
  getPendingHref,
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

test("a pending destination becomes active immediately", () => {
  assert.equal(getActivePathname("/dashboard", "/messages"), "/messages");
  assert.equal(getActivePathname("/messages", null), "/messages");
});

test("the most specific dashboard destination owns a nested route", () => {
  const links = ["/", "/profile", "/profile/cv", "/messages"];

  assert.equal(getActiveHref("/profile/cv", links), "/profile/cv");
  assert.equal(getActiveHref("/messages/abc", links), "/messages");
  assert.equal(getActiveHref("/settings", links), null);
});

test("pending feedback clears as soon as the pathname changes", () => {
  const pending = { href: "/messages", fromPathname: "/dashboard" };

  assert.equal(getPendingHref("/dashboard", pending), "/messages");
  assert.equal(getPendingHref("/messages", pending), null);
  assert.equal(getPendingHref("/dashboard", null), null);
});
