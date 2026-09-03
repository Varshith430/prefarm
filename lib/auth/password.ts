/**
 * Password hashing.
 *
 * Uses scrypt from `node:crypto` rather than bcrypt or argon2: it is a memory-
 * hard KDF built into Node, so there is no native module to compile on every
 * deployment target. Parameters are stored alongside each hash, so they can be
 * raised later without invalidating existing passwords.
 */

import {
  randomBytes,
  scrypt as scryptCallback,
  type ScryptOptions,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

// `promisify` collapses scrypt's overloads onto the three-argument form, which
// drops the options object the cost parameters travel in; the signature is
// restated here so they can be passed.
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Cost parameters for new hashes. N is the CPU/memory cost, r the block size,
 * p the parallelisation. Memory used is roughly 128 * N * r = 32 MiB, which
 * Node will not allocate under its default 32 MiB `maxmem`, so the limit is
 * raised explicitly below.
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 128 * PARAMS.N * PARAMS.r * 2;

/**
 * A hash of a password nobody holds, used to spend the same time verifying a
 * sign-in for an address that has no account as for one that does. Without it,
 * the response time alone would say whether an email is registered.
 */
let dummyHashPromise: Promise<string> | null = null;

function encode(salt: Buffer, derived: Buffer): string {
  const { N, r, p } = PARAMS;
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  derived: Buffer;
}

function decode(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;

  const [, rawN, rawR, rawP, rawSalt, rawDerived] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return null;
  }

  return {
    N,
    r,
    p,
    salt: Buffer.from(rawSalt, "base64url"),
    derived: Buffer.from(rawDerived, "base64url"),
  };
}

/** Derives a storable hash: `scrypt$N$r$p$salt$key`, all base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: MAX_MEMORY,
  });

  return encode(salt, derived);
}

/**
 * Checks a password against a stored hash in constant time.
 *
 * `stored` may be null — an account that has never set a password — in which
 * case this still does the full derivation against a dummy hash before
 * returning false, so the failure is indistinguishable from a wrong password.
 */
export async function verifyPassword(
  password: string,
  stored: string | null,
): Promise<boolean> {
  if (stored === null) {
    dummyHashPromise ??= hashPassword(randomBytes(32).toString("base64url"));
    await verifyPassword(password, await dummyHashPromise);
    return false;
  }

  const parsed = decode(stored);
  if (!parsed) return false;

  const candidate = await scrypt(
    password.normalize("NFKC"),
    parsed.salt,
    parsed.derived.length,
    { N: parsed.N, r: parsed.r, p: parsed.p, maxmem: MAX_MEMORY },
  );

  return (
    candidate.length === parsed.derived.length &&
    timingSafeEqual(candidate, parsed.derived)
  );
}

/**
 * Whether a stored hash was made with parameters weaker than the current ones,
 * so a successful sign-in can quietly re-hash the password at the new cost.
 */
export function needsRehash(stored: string | null): boolean {
  if (stored === null) return false;
  const parsed = decode(stored);
  if (!parsed) return true;
  return parsed.N < PARAMS.N || parsed.r < PARAMS.r || parsed.p < PARAMS.p;
}
