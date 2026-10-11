import { HttpError } from "@/lib/create/platform/http";
import { WHOP_API } from "./whop";

/** No automatic retries: a timed-out POST may already have charged the card. */
export async function topUpWhop<T>(path: string, payload?: unknown): Promise<T> {
  const response = await fetch(`${WHOP_API}${path}`, {
    method: payload === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${process.env.WHOP_API_KEY?.trim()}`, "content-type": "application/json" },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new HttpError(502, "Whop could not confirm the payment details. Please try again later.", "topup_provider", { providerStatus: response.status });
  return response.json() as Promise<T>;
}

export type TopUpPayment = {
  id: string; status?: string; substatus?: string; currency?: string; total?: number; subtotal?: number;
  paid_at?: string | null; refunded_at?: string | null;
  company?: { id?: string }; member?: { id?: string }; user?: { id?: string };
  plan?: { id?: string }; metadata?: Record<string, unknown>;
};

export type SavedCard = { id: string; payment_method_type: string; card?: { last4?: string; brand?: string; expired?: boolean } };
export type TopUpVariant = { id: string; account?: { id?: string }; company?: { id?: string }; plan_type: string; currency: string; initial_price: number; tax_type: string };
