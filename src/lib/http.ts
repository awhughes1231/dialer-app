import { NextResponse } from "next/server";

export function jsonError(error: unknown, fallback = "Something went wrong."): NextResponse {
  const declared = typeof error === "object" && error && "status" in error && typeof error.status === "number" ? error.status : null;
  const safeStatus = declared && declared >= 400 && declared < 600 ? declared : null;
  console.error(error);
  if (error instanceof Error && !/prisma|invalid `/i.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: safeStatus ?? 400 });
  }
  return NextResponse.json({ error: fallback }, { status: safeStatus ?? 500 });
}
