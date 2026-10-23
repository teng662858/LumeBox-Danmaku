import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const dryRun = process.argv.includes('--dry-run');
const token = process.env.DANMAKU_ACCESS_TOKEN?.trim();
if (!dryRun && (!token || token.length < 24 || !/^[A-Za-z0-9_-]+$/.test(token))) {
  throw new Error('Set encrypted build variable DANMAKU_ACCESS_TOKEN (24+ URL-safe characters).');
}
function run(args, input) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
    input, env: {...process.env, WRANGLER_SEND_METRICS:'false'},
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(['deploy', ...(dryRun ? ['--dry-run'] : [])]);
if (!dryRun) run(['secret', 'put', 'TOKEN'], token + '\n');
