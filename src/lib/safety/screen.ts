/**
 * Input screening for chat prompts. Pure, no network, no model. Deliberately NARROW: it only catches requests that are
 * obviously illegal or severely harmful (sexual content involving minors, weapons capable of mass harm, malware built to
 * extort, synthesis of hard drugs, planning attacks on people). Everything else goes to the models, which have their own
 * provider-side policies. It is a first line, not a classifier: it will miss paraphrases, and says so (docs/known-gaps.md).
 *
 * Crisis is NOT abuse. A person who says they want to hurt themselves is never blocked or refused: they get the caring crisis
 * reply (and 988 in the US). If they also ask for a method, the reply is the fixed crisis text, never a model's answer.
 */
import { SUPPORT_FALLBACK } from "@/lib/orchestration/support";

export type ScreenResult =
  | { action: "allow" }
  | { action: "refuse"; category: string; reply: string }
  /** Self-harm with a request for a method: fixed caring reply, no model. Plain self-harm talk is `allow` and goes to the supportive path. */
  | { action: "crisis"; category: string; reply: string };

const REFUSAL = "I can't help with that. If you're working on something related that's legitimate, tell me more about the goal and I'll help with a safe version of it.";
const MINORS_REFUSAL = "I won't write or discuss sexual content involving minors. If you or someone you know is being harmed, please contact local emergency services or a child protection hotline (in the US, the Childhelp hotline is 1-800-422-4453).";

const RULES: { category: string; test: RegExp; reply?: string }[] = [
  { category: "sexual/minors", reply: MINORS_REFUSAL, test: /\b(child|children|minor|underage|under-age|preteen|teen|kid|toddler|schoolgirl|schoolboy|loli|shota)\b[\s\S]{0,60}\b(nude|naked|sexual|sex scene|erotic|explicit|nsfw|porn|undress)|\b(nude|naked|sexual|sex scene|erotic|explicit|nsfw|porn|undress)\w*\b[\s\S]{0,60}\b(child|children|minor|underage|under-age|preteen|kid|toddler|schoolgirl|schoolboy|loli|shota)\b/i },
  { category: "weapons/mass-harm", test: /\b(how (?:do i|to|can i)|steps? (?:to|for)|instructions? (?:to|for)|teach me to|help me)\b[\s\S]{0,40}\b(make|build|assemble|synthes(?:ize|ise)|cook|produce|weaponi[sz]e)\b[\s\S]{0,40}\b(pipe bomb|bomb|explosive|nerve agent|sarin|vx gas|anthrax|ricin|dirty bomb|bioweapon|chemical weapon|napalm|thermite bomb|ghost gun|untraceable gun)\b/i },
  { category: "violence/attack-planning", test: /\b(help me|how (?:do i|to|can i)|plan|plot|best way to)\b[\s\S]{0,30}\b(carry out|commit|execute|do|plan)\b[\s\S]{0,20}\b(mass shooting|school shooting|terror(?:ist)? attack|bombing|massacre|assassination)\b/i },
  { category: "violence/attack-planning", test: /\b(how (?:do i|to|can i)|best way to|help me)\b[\s\S]{0,15}\b(kill|murder|poison)\b[\s\S]{0,20}\b(my (?:wife|husband|boss|neighbou?r|teacher|classmate|ex|mother|father|roommate)|someone without (?:getting caught|being caught))/i },
  { category: "malware/extortion", test: /\b(write|build|code|create|make)\b[\s\S]{0,30}\b(ransomware|credential stealer|password stealer|botnet (?:client|malware)|keylogger that (?:hides|evades)|wiper malware)\b/i },
  { category: "drugs/synthesis", test: /\b(synthes(?:ize|ise)|cook|manufacture|make)\b[\s\S]{0,25}\b(meth(?:amphetamine)?|fentanyl|heroin|crack cocaine|mdma)\b[\s\S]{0,40}\b(step[- ]by[- ]step|at home|recipe|instructions|reagents?|precursors?)\b|\b(step[- ]by[- ]step|recipe|instructions)\b[\s\S]{0,30}\b(synthes(?:ize|ise)|cook|make)\b[\s\S]{0,15}\b(meth(?:amphetamine)?|fentanyl|heroin)\b/i },
  { category: "trafficking/exploitation", test: /\b(how (?:do i|to|can i)|help me)\b[\s\S]{0,30}\b(traffic|smuggle)\b[\s\S]{0,20}\b(people|humans|women|children|girls|migrants)\b/i },
];

const SELF_HARM = /\b(kill myself|killing myself|end my life|want to die|wanna die|suicid\w*|self[- ]?harm|hurt(?:ing)? myself|harm(?:ing)? myself|take my own life|better off (?:dead|without me))\b/i;
const METHOD_ASK = /\b(how (?:do i|to|can i|many|much)|best way|painless|easiest way|methods? (?:of|to|for)|ways to|lethal dose|what (?:pills|medication|dose)|step[- ]by[- ]step)\b/i;

export function screenPrompt(text: string): ScreenResult {
  const t = (text || "").slice(0, 20_000);
  if (SELF_HARM.test(t) && METHOD_ASK.test(t)) return { action: "crisis", category: "self-harm/method", reply: SUPPORT_FALLBACK.crisis };
  for (const r of RULES) if (r.test.test(t)) return { action: "refuse", category: r.category, reply: r.reply ?? REFUSAL };
  return { action: "allow" };
}

/**
 * A short house rule sent with every model call. Keplar may be used by teenagers (13+ with a guardian's permission, see the
 * Terms), so the defaults are age-appropriate: no sexual content, no graphic violence, no encouragement of self-harm or
 * dangerous challenges, kind and non-judgemental on hard topics, and a pointer to a trusted adult or crisis line when someone is in distress.
 */
export const SAFETY_DEFAULTS_PROMPT =
  "House rules: some people you talk to are teenagers. Keep content age-appropriate: no sexual content, no graphic violence, no instructions for self-harm, weapons, illegal drugs or dangerous challenges. Stay kind and non-judgemental on sensitive topics, and if someone seems to be in distress, suggest a trusted adult or a crisis line (in the US, call or text 988). For legal, medical or money decisions, say plainly that you are not a professional and that a minor should involve a parent or guardian.";
