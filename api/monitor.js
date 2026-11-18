/*
  Smart Baby Monitor - cloud "post office" running on Vercel (Hobby, free).

  One function handles everything. The ?op=... part of the address says what to do:

    GET  /api/monitor?op=health                 -> setup check (no key needed, shows no secrets)
    POST /api/monitor?op=device&id=baby1        -> the BOARD sends readings, gets back commands
    GET  /api/monitor?op=status&id=baby1&watch=1 -> the PHONE reads the latest readings
                                                   (watch=1 only while the page is on screen)
    POST /api/monitor?op=cmd&id=baby1           -> the PHONE sends a command (body = command text)

  Everything except "health" needs the header  x-monitor-key: <MONITOR_KEY>
  MONITOR_KEY is set in Vercel -> Settings -> Environment Variables (README Part B).

  Vercel functions forget everything between calls, so the latest readings and the
  waiting commands are kept in a small free Redis database (README Part C).
*/
import { createClient } from 'redis';
import { timingSafeEqual } from 'node:crypto';

const COMMANDS = new Set(['buzzer_on', 'buzzer_off', 'mute_on', 'mute_off', 'toggle_buzzer', 'toggle_mute']);
const ID_RE = /^[A-Za-z0-9-]{1,32}$/;
const STATUS_TTL_S = 24 * 3600; // keep the last reading for 1 day
const CMD_TTL_S = 60;           // a command not picked up within 60 s is thrown away (never sounds the buzzer late)
const VIEWER_TTL_MS = 20000;    // "a parent is watching" lasts 20 s after the phone's last check
const MAX_BODY = 1024;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ---------- Database (one shared connection per running instance) ----------
let redisPromise = null;
async function redis() {
  const url = process.env.REDIS_URL || process.env.KV_URL;
  if (!url) throw new HttpError(500, 'Database not connected: REDIS_URL is missing. Do README Part C, then Redeploy.');
  if (redisPromise) {
    const existing = await redisPromise.catch(() => null);
    if (existing && existing.isOpen) return existing;
    redisPromise = null; // connection was lost: make a new one below
  }
  const client = createClient({
    url,
    // Give up after 2 quick retries so a request fails in seconds instead of hanging.
    socket: { connectTimeout: 4000, reconnectStrategy: (retries) => (retries >= 2 ? new Error('Database unreachable') : 300) },
  });
  client.on('error', (err) => console.error('Redis error:', err.message));
  redisPromise = client.connect().then(() => client).catch((err) => {
    redisPromise = null;
    client.destroy?.();
    throw new HttpError(503, 'Cannot reach the database: ' + err.message);
  });
  return redisPromise;
}

// No database call may take longer than this.
function withTimeout(promise, ms = 8000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new HttpError(503, 'Database too slow, try again')), ms); }),
  ]).finally(() => clearTimeout(timer));
}

// ---------- Helpers ----------
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function checkKey(request) {
  const expected = process.env.MONITOR_KEY || '';
  if (!expected) throw new HttpError(500, 'MONITOR_KEY is not set in Vercel. Do README Part B step 6, then Redeploy.');
  const given = request.headers.get('x-monitor-key') || '';
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'Wrong monitor key');
}

function deviceId(url) {
  const id = url.searchParams.get('id') || '';
  if (!ID_RE.test(id)) throw new HttpError(400, 'Bad monitor name (use letters, numbers and dashes only)');
  return id;
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Message too large');
  return text;
}

const keys = (id) => ({ status: `bm:${id}:status`, cmd: `bm:${id}:cmd`, viewer: `bm:${id}:viewer` });

// ---------- Actions ----------
async function health() {
  const result = { ok: false, keySet: Boolean(process.env.MONITOR_KEY), database: false, message: '' };
  try {
    const db = await redis();
    await withTimeout(db.ping());
    result.database = true;
  } catch (err) {
    result.message = err.message;
  }
  result.ok = result.keySet && result.database;
  if (result.ok) result.message = 'All good. Copy this site address into the Arduino code (README Part D).';
  else if (!result.keySet) result.message = 'MONITOR_KEY is missing (README Part B step 6), then Redeploy.';
  return json(result, result.ok ? 200 : 500);
}

// The board sends its readings and receives waiting commands in the same reply.
async function fromDevice(request, id) {
  let status;
  try { status = JSON.parse(await readBody(request)); } catch { throw new HttpError(400, 'Readings were not valid JSON'); }
  if (!status || typeof status !== 'object' || Array.isArray(status)) throw new HttpError(400, 'Readings were not a JSON object');
  status.ts = Date.now(); // server clock, so the phone's clock does not matter

  const k = keys(id);
  const db = await redis();
  const [, popped, watching] = await db.multi()
    .set(k.status, JSON.stringify(status), { EX: STATUS_TTL_S })
    .lPopCount(k.cmd, 10)
    .exists(k.viewer)
    .exec();

  const cmds = (popped || []).filter((c) => COMMANDS.has(c));
  return json({ watching: Number(watching) > 0, cmds });
}

// The phone reads the latest readings. If the page is on screen (watch=1) this also
// tells the board "a parent is watching", so the board checks in faster.
async function toPhone(id, watch) {
  const k = keys(id);
  const db = await redis();
  let tx = db.multi().get(k.status);
  if (watch) tx = tx.set(k.viewer, '1', { PX: VIEWER_TTL_MS });
  const [raw] = await tx.exec();
  let status = null;
  if (raw) { try { status = JSON.parse(raw); } catch { status = null; } }
  return json({ status, now: Date.now() });
}

async function command(request, id) {
  const cmd = (await readBody(request)).trim();
  if (!COMMANDS.has(cmd)) throw new HttpError(400, 'Unknown command');
  const k = keys(id);
  const db = await redis();
  await db.multi().rPush(k.cmd, cmd).expire(k.cmd, CMD_TTL_S).exec();
  return json({ queued: cmd });
}

// ---------- Router ----------
async function handle(request) {
  const url = new URL(request.url);
  const op = url.searchParams.get('op') || '';
  const method = request.method.toUpperCase();

  if (op === 'health' && method === 'GET') return health();

  checkKey(request);
  const id = deviceId(url);
  if (op === 'device' && method === 'POST') return fromDevice(request, id);
  if (op === 'status' && method === 'GET') return toPhone(id, url.searchParams.get('watch') === '1');
  if (op === 'cmd' && method === 'POST') return command(request, id);
  throw new HttpError(404, 'Unknown address');
}

export default {
  async fetch(request) {
    try {
      return await withTimeout(handle(request), 9000);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) console.error(err);
      return json({ error: err.message || 'Server error' }, status);
    }
  },
};
