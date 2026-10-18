/**
 * What Enter does in a chat composer.
 *
 * A textarea's default for Enter is a newline, and a form does not submit from it. Callers prevent that default
 * except when the result is "newline" (Shift+Enter, or plain Enter when the device preference is Ctrl/⌘+Enter).
 * An IME composition (isComposing, or keyCode 229) is left to the browser so a candidate can commit.
 * An empty message, or a reply that is still streaming, does not send and does not insert a newline ("swallow").
 */
export type ComposerKey = {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  isComposing?: boolean;
  /** DOM keyCode. 229 means an IME composition is in progress. Read it from the native event. */
  keyCode?: number;
};

export type ComposerEnter = "send" | "newline" | "swallow";

export function composerEnter(
  e: ComposerKey,
  opts: { canSend: boolean; sendKey?: "enter" | "mod-enter" },
): ComposerEnter {
  if (e.key !== "Enter") return "newline";
  if (e.isComposing || e.keyCode === 229) return "newline";
  const mod = Boolean(e.metaKey || e.ctrlKey);
  const plainSends = (opts.sendKey ?? "enter") !== "mod-enter";
  const wantsSend = mod || (plainSends && !e.shiftKey);
  if (!wantsSend) return "newline";
  return opts.canSend ? "send" : "swallow";
}

/** React 19 does not put keyCode on the synthetic event. The IME signal lives on the native event. */
export function readComposerKey(e: {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
}): ComposerKey {
  return {
    key: e.key,
    shiftKey: e.shiftKey,
    metaKey: e.metaKey,
    ctrlKey: e.ctrlKey,
    isComposing: Boolean(e.nativeEvent?.isComposing),
    keyCode: e.nativeEvent?.keyCode ?? 0,
  };
}
