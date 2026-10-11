/**
 * Cross-platform spawnSync for package-manager CLIs. On Windows `npm`, `npx`, `vercel` etc. are `.cmd` shims, which Node refuses to spawn
 * without a shell (EINVAL since the 2024 BatBadBut fix), so there the command line is quoted and run through cmd.exe. POSIX is unchanged.
 */
import { spawnSync } from "node:child_process";

const win = process.platform === "win32";
// cmd.exe quoting: wrap anything with spaces or shell metacharacters in double quotes (none of our args contain a double quote).
const quote = (a) => (/^[\w@+=:,./\\-]+$/.test(a) ? a : `"${a}"`);

export function run(cmd, args = [], opts = {}) {
  if (!win) return spawnSync(cmd, args, opts);
  // One pre-quoted string instead of (cmd, args, { shell }) avoids Node's DEP0190 warning about unescaped shell args.
  return spawnSync([cmd, ...args].map(quote).join(" "), { ...opts, shell: true });
}
