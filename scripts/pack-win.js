#!/usr/bin/env node

const { spawn } = require('child_process');

function normalizeBoolean(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return null;
}

function looksLikeSymlinkPrivilegeError(output) {
  const lower = output.toLowerCase();
  return (
    lower.includes('cannot create symbolic link') ||
    lower.includes('a required privilege is not held by the client')
  );
}

function runElectronBuilder(builderArgs) {
  const electronBuilderCli = require.resolve('electron-builder/out/cli/cli.js');

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [electronBuilderCli, ...builderArgs], {
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let combinedOutput = '';

    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      combinedOutput += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      combinedOutput += chunk.toString();
    });

    child.on('close', (code) => {
      resolve({ code: code ?? 1, output: combinedOutput });
    });
  });
}

async function main() {
  const userArgs = process.argv.slice(2);
  const baseArgs = ['--win', '--x64', '--dir', ...userArgs];

  const forceNoRcedit = normalizeBoolean(process.env.WORKBEE_FORCE_NO_WIN_RCEDIT);
  const allowFallback = normalizeBoolean(process.env.WORKBEE_NO_WIN_SYMLINK_FALLBACK);

  const shouldForceNoRcedit = forceNoRcedit === true;
  const shouldDisableFallback = allowFallback === true;

  const primaryArgs = shouldForceNoRcedit
    ? [...baseArgs, '-c.win.signAndEditExecutable=false']
    : baseArgs;

  const firstRun = await runElectronBuilder(primaryArgs);
  if (firstRun.code === 0) {
    process.exit(0);
    return;
  }

  if (!looksLikeSymlinkPrivilegeError(firstRun.output)) {
    process.exit(firstRun.code);
    return;
  }

  console.error(
    [
      '',
      '[workbee] electron-builder failed to extract winCodeSign because Windows symlink creation is blocked.',
      '[workbee] Fix (recommended): enable Windows Developer Mode, or run the terminal as Administrator, then retry.',
      '[workbee] Fallback: rerun with win.signAndEditExecutable=false (disables exe icon/metadata + code signing).',
    ].join('\n')
  );

  if (shouldDisableFallback) {
    process.exit(firstRun.code);
    return;
  }

  const fallbackArgs = [...baseArgs, '-c.win.signAndEditExecutable=false'];
  const fallbackRun = await runElectronBuilder(fallbackArgs);
  process.exit(fallbackRun.code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

