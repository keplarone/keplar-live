// Synced from keplarone/space-studio src/core — edit there, then copy.
/** Shared types for the Local (free) engine: an AI model the person runs on their own computer (Ollama or llama.cpp). */
import type { Workload } from "./models";
import type { TrackId } from "./specialists";
import type { Troubleshoot } from "./troubleshoot";

export type LocalEngineKind = "ollama" | "llamacpp";
export type LocalConfig = { engine: LocalEngineKind; port: number };

export const LOCAL_ENGINES: Record<LocalEngineKind, { name: string; defaultPort: number; installUrl: string }> = {
  ollama: { name: "Ollama", defaultPort: 11434, installUrl: "https://ollama.com/download" },
  llamacpp: { name: "llama.cpp server", defaultPort: 8080, installUrl: "https://github.com/ggml-org/llama.cpp" },
};

export type LocalStatus = { reachable: true; models: string[] } | { reachable: false; troubleshoot: Troubleshoot };

export type LocalChatRequest = {
  config: LocalConfig;
  model: string;
  workspace: Workload;
  messages: { role: "user" | "assistant"; content: string }[];
};

export type LocalChatResult =
  | { ok: true; text: string; model: string; track: TrackId; usage: { promptTokens: number | null; completionTokens: number | null; latencyMs: number } }
  | { ok: false; troubleshoot: Troubleshoot };
