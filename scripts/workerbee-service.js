#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function toPort(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 65535) return fallback;
  return Math.trunc(n);
}

function toHost(value, fallback) {
  const v = String(value ?? '').trim();
  return v ? v : fallback;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function main() {
  const appDir = path.resolve(__dirname, '..');
  const configPath =
    process.env.WORKERBEE_CONFIG || path.join(appDir, 'config.json');
  const dataDir =
    process.env.WORKERBEE_DATA_DIR || path.join(appDir, 'data');

  ensureDir(dataDir);

  const config = readJson(configPath) || {};

  const webPort = toPort(config.webPort, toPort(process.env.WEB_PORT, 9229));
  const apiPort = toPort(config.apiPort, toPort(process.env.API_PORT, 9339));
  const host = toHost(config.host, toHost(process.env.HOST, '0.0.0.0'));

  process.env.NODE_ENV = 'production';
  process.env.WEB_PORT = String(webPort);
  process.env.API_PORT = String(apiPort);
  process.env.HOST = host;
  process.env.DB_PATH =
    process.env.DB_PATH || path.join(dataDir, 'workbee.json');

  // Starts the Express server (server.js reads env on import).
  // eslint-disable-next-line global-require
  require(path.join(appDir, 'server.js'));
}

main();

