import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import DashboardLoading from "../src/app/(dashboard)/loading";

test("dashboard loading feedback is decorative and preserves page geometry", () => {
  const markup = renderToStaticMarkup(<DashboardLoading />);

  assert.match(markup, /aria-hidden="true"/);
  assert.match(markup, /min-h-\[60vh\]/);
  assert.equal((markup.match(/data-loading-card=/g) ?? []).length, 3);
  assert.equal((markup.match(/data-loading-row=/g) ?? []).length, 5);
});
