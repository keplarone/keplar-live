/**
 * Live code engine: public API.
 *
 *   const a = useStudioAgent(bridge);                 // a.events, a.code, a.revert, a.retry
 *   <CodePanel {...codePanelProps(a)} />              // tabs, path, status, code or diff, diagnostics
 *   <ChangesList changes={a.code.changes} onRevert={a.revert} onRetry={a.retry} />
 *   <Timeline events={a.events} />
 *
 * CodeMirror is only loaded when CodePanel or DiffView mounts (dynamic import of ./cm).
 */
import type { StudioAgent } from "../useStudioAgent";
import type { CodePanelProps } from "./CodePanel";

export { CodePanel, type CodePanelProps, type CodeView } from "./CodePanel";
export { DiffView, type DiffViewProps, type DiffMode } from "./DiffView";
export { Timeline, type TimelineProps } from "./Timeline";
export { ChangesList, type ChangesListProps } from "./ChangesList";
export { CodeViewer, type CodeViewerProps } from "./CodeViewer";
export { statusLabel } from "./parts";
export {
  applyEdits, buildRevert, deriveDocuments, editOutcome, isRevertLineage, multiEditSchema, parseMultiEdit, parseScriptRead, retryAvailability, retryAvailabilityFor, revertAvailability, scriptDocId,
  type Availability, type ChangeEntry, type CodeDocument, type CodeModel, type DeriveOptions, type Diagnostic, type DocLanguage, type DocStatus, type DocVersion, type EditSpec, type ParsedEdit, type ScriptChange, type ScriptSource,
} from "./documents";
export {
  actionPhases, appendEvent, clip, describeEvent, eventStamper, MAX_EVENTS, MAX_EVENT_TEXT, MAX_SOURCE_CHARS,
  type ActionOrigin, type ActionPhase, type EditOutcome, type ReadFormat, type ReadPurpose, type StudioEvent, type StudioEventBody, type StudioEventKind, type TurnUsage,
} from "./events";
export { diffLines, splitLines, type DiffOp, type DiffSummary, type LineRange } from "./line-diff";

/** CodePanel props wired to the run engine: Approve/Decline go to the real approval, Revert/Retry to the hook's page actions. */
export function codePanelProps(a: Pick<StudioAgent, "code" | "decide" | "revert" | "retry">): Pick<CodePanelProps, "model" | "onApprove" | "onDecline" | "onRevert" | "onRetry"> {
  return {
    model: a.code,
    onApprove: (k) => a.decide(k, true),
    onDecline: (k) => a.decide(k, false),
    onRevert: (id) => { void a.revert(id); },
    onRetry: (k) => { void a.retry(k); },
  };
}
