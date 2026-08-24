const CHECKOUT_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export type RazorpayCheckoutResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = { open: () => void };
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

function loadRazorpayScript(): Promise<RazorpayConstructor> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay checkout can only be opened in the browser"));
  }
  if (window.Razorpay) {
    return Promise.resolve(window.Razorpay);
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.src = CHECKOUT_SCRIPT_SRC;
    script.async = true;
    script.addEventListener("load", () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error("Razorpay checkout script loaded but window.Razorpay is unavailable"));
    });
    script.addEventListener("error", () => reject(new Error("Failed to load the Razorpay checkout script")));
    if (!existing) document.body.appendChild(script);
  });
}

// Rejects with an Error whose message is exactly "cancelled" when the user
// closes the checkout modal without paying - callers switch on that message
// to distinguish a cancel from an actual failure.
export async function openRazorpayCheckout(options: {
  orderId: string;
  amountPaise: number;
  currency: string;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
}): Promise<RazorpayCheckoutResult> {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  if (!keyId) {
    throw new Error("NEXT_PUBLIC_RAZORPAY_KEY_ID is not configured");
  }

  const Razorpay = await loadRazorpayScript();

  return new Promise((resolve, reject) => {
    const instance = new Razorpay({
      key: keyId,
      order_id: options.orderId,
      amount: options.amountPaise,
      currency: options.currency,
      name: options.name,
      description: options.description,
      prefill: options.prefill,
      handler: (response: RazorpayCheckoutResult) => resolve(response),
      modal: {
        ondismiss: () => reject(new Error("cancelled")),
      },
    });
    instance.open();
  });
}
