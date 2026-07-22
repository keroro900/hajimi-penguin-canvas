'use strict';

const fs = require('node:fs');
const path = require('node:path');

function comparable(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function readAbsoluteArgument(argv, name) {
  const prefix = `${name}=`;
  const matches = argv.filter((value) => typeof value === 'string' && value.startsWith(prefix));
  if (matches.length !== 1) return null;
  const raw = matches[0].slice(prefix.length);
  return raw && path.isAbsolute(raw) ? path.resolve(raw) : null;
}

function resolveSmokeReadyRequest(argv = process.argv) {
  const userData = readAbsoluteArgument(argv, '--user-data-dir');
  const marker = readAbsoluteArgument(argv, '--t8-smoke-ready');
  if (!userData || !marker) return null;
  const expectedMarker = path.join(userData, 'ready.json');
  if (comparable(marker) !== comparable(expectedMarker)) return null;
  return { userData, marker };
}

function writeSmokeReadyMarker({ argv = process.argv, version }) {
  const request = resolveSmokeReadyRequest(argv);
  if (!request) return false;
  const userDataStat = fs.lstatSync(request.userData);
  if (!userDataStat.isDirectory() || userDataStat.isSymbolicLink() || fs.existsSync(request.marker)) return false;
  const temporary = path.join(request.userData, `.ready.${process.pid}.tmp`);
  try {
    fs.writeFileSync(temporary, `${JSON.stringify({ version })}\n`, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, request.marker);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch (_) {}
    throw error;
  }
  return true;
}

module.exports = { resolveSmokeReadyRequest, writeSmokeReadyMarker };
