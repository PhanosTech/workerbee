#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

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

function canCreateFileSymlink() {
  if (process.platform !== 'win32') return true;
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'workerbee-symlink-'));
  try {
    const target = path.join(tmpBase, 'target.txt');
    const link = path.join(tmpBase, 'link.txt');
    fs.writeFileSync(target, 'x');
    fs.symlinkSync(target, link, 'file');
    return true;
  } catch {
    return false;
  } finally {
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
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

  const shouldForceNoRcedit = normalizeBoolean(process.env.WORKBEE_FORCE_NO_WIN_RCEDIT) === true;
  const shouldDisableFallback = normalizeBoolean(process.env.WORKBEE_NO_WIN_SYMLINK_FALLBACK) === true;

  const fallbackArgs = [...baseArgs, '-c.win.signAndEditExecutable=false'];

  if (shouldForceNoRcedit) {
    const fallbackRun = await runElectronBuilder(fallbackArgs);
    process.exit(fallbackRun.code);
    return;
  }

  const symlinkAllowed = canCreateFileSymlink();
  if (!symlinkAllowed && !shouldDisableFallback) {
    console.error(
      [
        '',
        '[workbee] Windows symlink creation is blocked; packaging will use win.signAndEditExecutable=false.',
        '[workbee] Fix (recommended): enable Windows Developer Mode, or run the terminal as Administrator, then retry.',
      ].join('\n')
    );
    const fallbackRun = await runElectronBuilder(fallbackArgs);
    process.exit(fallbackRun.code);
    return;
  }

  const primaryArgs = baseArgs;

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

  const fallbackRun = await runElectronBuilder(fallbackArgs);
  process.exit(fallbackRun.code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
