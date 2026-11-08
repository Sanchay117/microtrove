import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { config } from "./config.ts";
import { describe, log } from "./format.ts";

export type Level = "info" | "warn" | "error";

type State = {
  /** Alert key to the time it was last sent, in ms. */
  sent: Record<string, number>;
  /** Scans that failed in a row. */
  failures: number;
};

const WEEK_MS = 7 * 24 * 3_600_000;

function load(): State {
  if (!config.stateFile) return { sent: {}, failures: 0 };
  try {
    const raw = JSON.parse(readFileSync(config.stateFile, "utf8")) as Partial<State>;
    return { sent: raw.sent ?? {}, failures: raw.failures ?? 0 };
  } catch {
    return { sent: {}, failures: 0 };
  }
}

// Kept on disk when STATE_FILE is set, so a keeper started fresh every few minutes by
// cron remembers which alerts it already sent and how many scans failed in a row.
const state = load();

export function saveState() {
  if (!config.stateFile) return;
  const now = Date.now();
  for (const [key, at] of Object.entries(state.sent)) if (now - at > WEEK_MS) delete state.sent[key];
  writeFileSync(config.stateFile, JSON.stringify(state));
}

/** Counts consecutive failed scans; returns the current streak. */
export function recordScan(ok: boolean): number {
  state.failures = ok ? 0 : state.failures + 1;
  return state.failures;
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

const TAG: Record<Level, string> = { info: "[ok]", warn: "[warn]", error: "[alert]" };

/**
 * Logs `text` and sends it to the configured channels unless the same `key` was sent
 * within `repeatHours`. A webhook gets `{ content, text }`, which Discord and Slack
 * both accept; Telegram gets a sendMessage call.
 */
export async function alert(level: Level, key: string, text: string, repeatHours = 6) {
  log[level](text);
  if (!config.alertWebhook && !config.telegram) return;
  const now = Date.now();
  const last = state.sent[key];
  if (last !== undefined && now - last < repeatHours * 3_600_000) return;
  state.sent[key] = now;

  const message = `${TAG[level]} Microtrove keeper: ${text}`;
  const sends: Promise<void>[] = [];
  if (config.alertWebhook) sends.push(post(config.alertWebhook, { content: message, text: message }));
  if (config.telegram) {
    const { token, chatId } = config.telegram;
    sends.push(post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: chatId, text: message }));
  }
  for (const result of await Promise.allSettled(sends)) {
    if (result.status === "rejected") log.warn(`alert not delivered: ${describe(result.reason)}`);
  }
}

/** Adds a line to the GitHub Actions run summary when running there. */
export function summary(line: string) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, `${line}\n`);
}
