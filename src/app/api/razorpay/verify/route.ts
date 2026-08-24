import { NextRequest, NextResponse } from "next/server";
import { verifyRazorpaySignature } from "@/lib/razorpay";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { orderId?: unknown; paymentId?: unknown; signature?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const { orderId, paymentId, signature } = body;
  if (
    typeof orderId !== "string" || !orderId ||
    typeof paymentId !== "string" || !paymentId ||
    typeof signature !== "string" || !signature
  ) {
    return NextResponse.json(
      { error: "orderId, paymentId, and signature are required" },
      { status: 400 }
    );
  }

  try {
    const valid = verifyRazorpaySignature(orderId, paymentId, signature);
    return NextResponse.json({ valid });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to verify signature" },
      { status: 500 }
    );
  }
}
