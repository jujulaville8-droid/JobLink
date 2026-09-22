import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { Button } from "../src/components/ui/button";

test("shared buttons expose brief press and busy feedback", () => {
  const markup = renderToStaticMarkup(
    <Button aria-busy="true">Save changes</Button>,
  );

  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /active:scale-\[0\.98\]/);
  assert.match(markup, /aria-\[busy=true\]:cursor-wait/);
});
