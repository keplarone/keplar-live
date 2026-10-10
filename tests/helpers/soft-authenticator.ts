/** A software WebAuthn authenticator (ES256, "none" attestation) so tests exercise real signature verification. */
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";

const head = (major: number, n: number) => (n < 24 ? Buffer.from([(major << 5) | n]) : n < 256 ? Buffer.from([(major << 5) | 24, n]) : Buffer.from([(major << 5) | 25, n >> 8, n & 255]));
type C = number | string | Buffer | C[] | Map<C, C>;
function cbor(v: C): Buffer {
  if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === "string") return Buffer.concat([head(3, Buffer.byteLength(v)), Buffer.from(v)]);
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (Array.isArray(v)) return Buffer.concat([head(4, v.length), ...v.map(cbor)]);
  return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
}
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest();
const b64 = (b: Buffer) => b.toString("base64url");

export class SoftAuthenticator {
  readonly credId = randomBytes(32);
  private readonly keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
  counter = 0;
  constructor(readonly rpId: string, readonly origin: string, readonly userHandle: Buffer = Buffer.alloc(0)) {}

  private clientData(type: string, challenge: string, origin = this.origin) {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }

  /** `flags` default: user present + user verified. */
  create(challenge: string, o: { flags?: number; origin?: string } = {}) {
    const jwk = this.keys.publicKey.export({ format: "jwk" });
    const cose = new Map<C, C>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x!, "base64url")], [-3, Buffer.from(jwk.y!, "base64url")]]);
    const counter = Buffer.alloc(4);
    const idLen = Buffer.alloc(2);
    idLen.writeUInt16BE(this.credId.length);
    const authData = Buffer.concat([sha(this.rpId), Buffer.from([(o.flags ?? 0x05) | 0x40]), counter, Buffer.alloc(16), idLen, this.credId, cbor(cose)]);
    const attestationObject = cbor(new Map<C, C>([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]));
    return {
      id: b64(this.credId),
      rawId: b64(this.credId),
      type: "public-key" as const,
      clientExtensionResults: {},
      response: { clientDataJSON: b64(this.clientData("webauthn.create", challenge, o.origin)), attestationObject: b64(attestationObject), transports: ["internal"] as const },
    };
  }

  get(challenge: string, o: { flags?: number; origin?: string; counter?: number } = {}) {
    this.counter = o.counter ?? this.counter + 1;
    const c = Buffer.alloc(4);
    c.writeUInt32BE(this.counter);
    const authData = Buffer.concat([sha(this.rpId), Buffer.from([o.flags ?? 0x05]), c]);
    const clientDataJSON = this.clientData("webauthn.get", challenge, o.origin);
    const signature = sign("sha256", Buffer.concat([authData, sha(clientDataJSON)]), this.keys.privateKey);
    return {
      id: b64(this.credId),
      rawId: b64(this.credId),
      type: "public-key" as const,
      clientExtensionResults: {},
      response: { authenticatorData: b64(authData), clientDataJSON: b64(clientDataJSON), signature: b64(signature), userHandle: this.userHandle.length ? b64(this.userHandle) : undefined },
    };
  }
}
