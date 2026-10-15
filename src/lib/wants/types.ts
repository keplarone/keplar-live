/** Wire types for Keplar Wants. Field names match the orchestrator JSON. */

export type AgentHit = {
  agentId: string;
  name: string;
  track: string;
  keywords: string[];
  skills: string[];
  apiSchema: Record<string, unknown>;
};

export type WantUi =
  | { type: "notice" }
  | { type: "question"; question: string; options: string[]; key?: string; placeholder?: string }
  | { type: "assistant"; prompt: string; needsLiveData: boolean }
  | { type: "pin"; summary: string }
  | { type: "fallback_modal"; title: string; message: string };

export type WantResult = {
  status: string;
  kind?: "food" | "groceries" | "shopping" | "booking" | "service" | "advice";
  code?: string;
  reason?: string;
  message?: string;
  agents?: AgentHit[];
  confirmationId?: string;
  track?: "A" | "B";
  ui?: WantUi;
  filled?: string[];
  submitted?: boolean;
  result?: string | null;
  detail?: string;
  provider?: string;
  op?: string;
  params?: Record<string, unknown>;
  note?: string;
  simulated?: boolean;
  placeholder?: boolean;
};

export type WantBody = {
  prompt: string;
  answers: Record<string, string>;
  confirmationId: string | null;
  pin: string | null;
};

