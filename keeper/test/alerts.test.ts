import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("alerts reach the webhook once per key and survive a restart", async () => {
  const received: { content: string; text: string }[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push(JSON.parse(body));
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as { port: number };

  const stateFile = join(mkdtempSync(join(tmpdir(), "keeper-")), "state.json");
  process.env.ALERT_WEBHOOK_URL = `http://127.0.0.1:${port}/hook`;
  process.env.STATE_FILE = stateFile;
  const alerts = await import("../src/alerts.ts");

  await alerts.alert("warn", "skip:0xabc:unprofitable", "not liquidating 0xabc");
  await alerts.alert("warn", "skip:0xabc:unprofitable", "not liquidating 0xabc");
  await alerts.alert("error", "fail:0xdef", "liquidating 0xdef failed");
  assert.equal(received.length, 2, "the repeated key is suppressed");
  assert.match(received[0].content, /^\[warn\] Microtrove keeper: not liquidating 0xabc$/);
  assert.equal(received[0].text, received[0].content, "Slack reads `text`, Discord reads `content`");

  assert.equal(alerts.recordScan(false), 1);
  assert.equal(alerts.recordScan(false), 2);
  alerts.saveState();
  const saved = JSON.parse(readFileSync(stateFile, "utf8"));
  assert.equal(saved.failures, 2);
  assert.ok(saved.sent["skip:0xabc:unprofitable"] > 0);

  server.close();
});
