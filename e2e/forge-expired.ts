/** Test helper (run with tsx): prints a validly signed parked-account cookie value that expired a second ago. */
import { encodeStash } from "@/lib/accounts/multi";

const [email] = process.argv.slice(2);
console.log(encodeStash({ v: 1, u: "usr_forged", e: email.toLowerCase(), n: null, sid: "forged-session", t: "x", d: "y", dr: null, r: true, ca: Date.now() - 1e9, x: Date.now() - 1000, s: Date.now() - 5000 }));
