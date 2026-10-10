# Voice mode (BETA)

Ask by voice, hear the answer. Free baseline: the browser's own Web Speech API. No server component, no audio ever reaches Keplar.

## What the user gets
- **Talk (beta)** button in the Ask box (next to Dictate): **hold** to speak and release to send (push-to-talk), or **tap once** to keep
  listening and tap again to send. Space/Enter held on the focused button works the same. Escape cancels listening and sends nothing.
  The recognised text is put in the message box and sent like a typed question (`src/components/app-ui/VoiceTalk.tsx`, `Composer.tsx`).
- **Listen** button in every answer card footer (`ListenButton.tsx`): reads the answer with `speechSynthesis`, tap again to stop. Escape
  stops it. Starting a new question, hiding the tab or leaving the page stops it. After a question asked by voice, the newest answer
  card reads itself once (armed for 3 minutes at most); a typed question never auto-reads.
- While an answer is playing the Talk button becomes **Stop** (one tap).
- Text for speech comes from the answer's markdown (`speakableText`): symbols are not spoken, code blocks become "Code example
  omitted.", links are read as their text, tables as rows, citations dropped; capped at 5,000 characters at a sentence boundary
  (the card announces it when only the first part is read). Utterances are short chunks so stopping is instant.
- Voice choice (`pickVoice`): on-device voice in the user's language first, then any voice in that language, then the browser default.

## Honest fallbacks
- No SpeechRecognition (e.g. Firefox): Talk becomes an explanatory button; its message says the browser "can read answers aloud but
  can't turn your speech into text" (or that voice mode isn't available at all). No promise that it will be supported.
- No speechSynthesis: no Listen button; the Talk message says answers stay on screen.
- Microphone blocked: the existing dictation errors apply (`VOICE_ERRORS.denied` etc.). The Permissions API is read (never prompting)
  where available so a known block is explained before a press; otherwise the block is learned when recognition starts. Typing always works.
- The mic prompt appears only when the user presses Talk.

## Privacy
- Keplar never receives, records or stores audio, and keeps no voiceprints. Voice code has no MediaRecorder / getUserMedia / Blob /
  storage / fetch (guarded by `tests/voice-mode.test.ts`).
- Chrome, Edge and Safari may send the audio to the browser vendor's recognition service; some read-aloud voices are online voices.
  That is the browser vendor's service. Keplar sends the answer text to no speech service. The privacy page (section "Voice dictation
  and voice mode (beta)") says this.

## Accessibility
- Real `<button>`s with names that change with state (`aria-label`), `aria-pressed`, `role=status` live regions ("Listening...",
  "Sending what I heard.", "Canceled.", "Reading the answer aloud..."), Escape to stop, keyboard hold or tap, bare `click` from assistive
  tech treated as a tap, 44px targets on touch (existing composer rules), listening pulse off under `prefers-reduced-motion`.

## Tests
- Unit: `tests/voice-mode.test.ts` (support detection and messages, speakable text, chunking, voice choice, tap vs hold, no-audio guard,
  privacy text, wiring).
- E2E with a stand-in for the browser APIs: `e2e/voice-mode.e2e.ts` (hold-to-talk, tap-to-latch, Space hold, Escape cancel, auto-read
  after a voice question and not after a typed one, tap-to-stop, Escape-to-stop, blocked mic, Firefox-like and no-support browsers,
  390px phone, no audio-type requests).

## BETA / not verified
- Beta everywhere it is shown. **Not tested with a real microphone or real recognition service** (the box has none): the stand-in
  replicates the API surface (`start/stop/abort`, `onstart/onresult/onerror/onend`, `speak/cancel`, `onend`); real-browser behaviour
  (Chrome's early end on silence, Safari's permission flow, iOS audio-unlock rules for speechSynthesis) needs a hand test on devices.
- iOS Safari only lets speech play after a user gesture: an auto-read after a voice question may be blocked there; the card then shows
  "Tap Listen to start" (handled via the `not-allowed` error) and the Listen button works.
- No Firefox recognition fallback and no server speech (Whisper/TTS) yet: COMING SOON, deliberately not built (cost, privacy).
- Language follows the browser locale; no in-app language picker yet.
