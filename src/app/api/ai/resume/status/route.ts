import { NextResponse } from "next/server";

// Temporarily disabled until the AI service is configured. No provider or billing calls.
export async function GET() {
  return NextResponse.json({ error: "AI features are temporarily unavailable.", code: "AI_DISABLED" }, { status: 503 });
}
