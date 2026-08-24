import { NextRequest, NextResponse } from "next/server";
import { createRazorpayOrder } from "@/lib/razorpay";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { amountPaise?: unknown; currency?: unknown; receipt?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const amountPaise = body.amountPaise;
  const receipt = body.receipt;
  if (typeof amountPaise !== "number" || !Number.isInteger(amountPaise) || amountPaise <= 0) {
    return NextResponse.json(
      { error: "amountPaise must be a positive integer" },
      { status: 400 }
    );
  }
  if (typeof receipt !== "string" || !receipt.trim()) {
    return NextResponse.json({ error: "receipt is required" }, { status: 400 });
  }
  const currency = typeof body.currency === "string" && body.currency ? body.currency : "INR";

  try {
    const order = await createRazorpayOrder({ amountPaise, currency, receipt });
    return NextResponse.json({ order });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create Razorpay order" },
      { status: 502 }
    );
  }
}
