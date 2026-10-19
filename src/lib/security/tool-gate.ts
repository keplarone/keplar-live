/**
 * Plug-in security gate for tool calls.
 *
 * The file scanner shape is `runSecurityGate({ files }, { checks, failAt })`.
 * A registered gate maps `mcp.call` arguments into that scanner and may only tighten
 * `authorize`'s decision: a clean call returns null, never allow.
 *
 * keplar-one's `src/security` was not readable here (the repository returned 404).
 * The check names, severities and failAt default match that design. Secret text uses
 * the same patterns the AI Firewall already blocks, so the two checks do not drift.
 */
import { SECRET_PATTERNS } from "@/lib/business/firewall";
import { registerSecurityGate, type AuthorizeRequest, type BuiltInDecision, type SecurityGate, type SecurityGateOpinion } from "./authorize";

export const SECURITY_CHECKS = ["hard-coded-secret", "missing-route-auth", "unsafe-execution"] as const;
export type SecurityCheck = (typeof SECURITY_CHECKS)[number];
export type SecuritySeverity = "low" | "medium" | "high" | "critical";

export type SecurityFinding = {
  check: SecurityCheck;
  severity: SecuritySeverity;
  path: string;
  message: string;
};

export type SecurityGateReport = {
  ok: boolean;
  failAt: SecuritySeverity;
  findings: SecurityFinding[];
  checksRun: SecurityCheck[];
};

const RANK: Record<SecuritySeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const ROUTE_FILE = /(?:^|\/)(?:app\/api\/.+\/route\.(?:ts|tsx|js|mjs)|pages\/api\/.+\.(?:ts|tsx|js|mjs))$/;
const HANDLER = /export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE)\b|export\s+const\s+(?:GET|POST|PUT|PATCH|DELETE)\b/;
const AUTH_CALL = /\b(?:getSession|currentWorkspace|mcpOwner|requireUser|requireAuth|requireOwner)\s*\(/;
const UNSAFE: RegExp[] = [
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\bchild_process\b/,
  /\b(?:execSync|execFileSync|spawnSync)\s*\(/,
  /\bos\.system\s*\(/,
  /\bsubprocess\.(?:run|call|Popen|check_output)\s*\(/,
  /\b(?:bash|sh|zsh|powershell|pwsh|cmd)(?:\.exe)?\s+-c\b/i,
  /\brm\s+-rf\s+\//,
  /\bcurl\b[^\n|]{0,120}\|\s*(?:sh|bash)\b/,
];

function isCheck(v: string): v is SecurityCheck {
  return (SECURITY_CHECKS as readonly string[]).includes(v);
}

function scan(file: { path: string; contents: string }, checks: Set<SecurityCheck>): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const text = file.contents ?? "";
  if (checks.has("hard-coded-secret")) {
    for (const [re] of SECRET_PATTERNS) {
      re.lastIndex = 0;
      if (re.test(text)) {
        findings.push({ check: "hard-coded-secret", severity: "critical", path: file.path, message: "Hard-coded secret." });
        break;
      }
    }
  }
  if (checks.has("unsafe-execution") && UNSAFE.some((re) => re.test(text))) {
    findings.push({ check: "unsafe-execution", severity: "high", path: file.path, message: "Unsafe execution." });
  }
  if (checks.has("missing-route-auth") && ROUTE_FILE.test(file.path) && HANDLER.test(text) && !AUTH_CALL.test(text)) {
    findings.push({ check: "missing-route-auth", severity: "high", path: file.path, message: "Route handler does not check who is calling." });
  }
  return findings;
}

/** Scan source files. `failAt` defaults to high: critical and high findings fail. */
export function runSecurityGate(
  input: { files?: { path: string; contents: string }[] },
  opts?: { checks?: readonly string[]; failAt?: SecuritySeverity },
): SecurityGateReport {
  const failAt: SecuritySeverity = opts?.failAt && opts.failAt in RANK ? opts.failAt : "high";
  const selected = (opts?.checks?.filter(isCheck) ?? [...SECURITY_CHECKS]) as SecurityCheck[];
  const checks = new Set(selected);
  const findings: SecurityFinding[] = [];
  for (const file of input.files ?? []) {
    if (!file || typeof file.path !== "string" || typeof file.contents !== "string") continue;
    findings.push(...scan(file, checks));
  }
  const ok = !findings.some((f) => RANK[f.severity] >= RANK[failAt]);
  return { ok, failAt, findings, checksRun: [...checks] };
}

const SECRET_DENY = "This tool call was refused because an argument contains a secret.";
const EXEC_DENY = "This tool call was refused because an argument asks for unsafe execution.";

/** Opinion for one tool call. Null leaves the built-in decision alone. Never returns allow. */
export function toolCallOpinion(input: AuthorizeRequest, builtIn: BuiltInDecision): SecurityGateOpinion | null {
  if (input.action !== "mcp.call" || !input.mcpCall) return null;
  if (builtIn.outcome === "deny") return null;
  let contents: string;
  try {
    contents = JSON.stringify(input.mcpCall.args ?? {});
  } catch {
    return { decision: "deny", code: "unsafe_execution", status: 403, message: EXEC_DENY };
  }
  const tool = typeof input.mcpCall.tool === "string" ? input.mcpCall.tool.replace(/[^\w.:-]/g, "").slice(0, 80) : "tool";
  const report = runSecurityGate(
    { files: [{ path: `mcp-call/${tool || "tool"}.json`, contents }] },
    { checks: ["hard-coded-secret", "unsafe-execution"] },
  );
  if (report.ok) return null;
  const secret = report.findings.some((f) => f.check === "hard-coded-secret" && RANK[f.severity] >= RANK[report.failAt]);
  return { decision: "deny", code: secret ? "secret_in_args" : "unsafe_execution", status: 403, message: secret ? SECRET_DENY : EXEC_DENY };
}

export const toolCallSecurityGate: SecurityGate = {
  name: "tool-call",
  evaluate: toolCallOpinion,
};

let unregister: (() => void) | null = null;

/** Register the tool-call gate. A second call does not add a second copy. */
export function registerToolCallSecurityGate(): () => void {
  if (!unregister) unregister = registerSecurityGate(toolCallSecurityGate);
  return () => {
    unregister?.();
    unregister = null;
  };
}
