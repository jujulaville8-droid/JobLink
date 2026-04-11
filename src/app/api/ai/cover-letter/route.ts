import { NextResponse } from "next/server";

/**
 * Smart Cover Letter is temporarily disabled while Anthropic API credits
 * are out. When re-enabling, restore the previous implementation from git
 * history (last working version in commit f1f620a's parent).
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Smart Cover Letter is temporarily unavailable. We're working on bringing it back soon.",
    },
    { status: 503 }
  );
}
