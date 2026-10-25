// Records footage of the live Microtrove app on Mezo Testnet, frame by frame, under Playwright's fake clock:
// timers, requestAnimationFrame and Date.now in the page advance exactly 1/30 s per captured frame, so the
// footage is smooth and lines up with the narration (src/generated/timing.json). A drawn cursor shows where
// the real mouse events go. While a transaction confirms, time keeps moving but no frames are kept.
//
// The borrow scene sends a real transaction from the dev burner wallet (web/.env.development.local), so the
// app must be running in dev mode and the burner must have no open trove.
//
// Usage: node scripts/capture.ts [scene...]   (app at MICROTROVE_URL, default http://localhost:5195/)
// Writes public/clips/<scene>.mp4 and public/clips/<scene>.json (sound cues, element boxes, tx hashes).

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { readTiming } from "./env.ts";

const BASE = process.env.MICROTROVE_URL ?? "http://localhost:5195/";
const W = 1600;
const H = 900;
const DSF = 1.5; // 2400×1350 frames, crisp when the composition zooms in
const FPS = 30;
const DT = 1000 / FPS;

const timing = readTiming();
const scene = (id: string) => timing.scenes.find((s) => s.id === id)!;
const lineStart = (id: string, i: number) => scene(id).lines[i].start;

/** The lend footage starts this far into the lenders scene, after the diagram. */
const LEND_OFFSET = 5.0;
/** The promote footage covers the promote scene's second line. */
const PROMOTE_FROM = lineStart("promote", 1) - 0.3;
const PROMOTE_TO = lineStart("promote", 2) + 0.2;

const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);

const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><path d="M4 2 L4 21 L9 16.5 L12.5 24 L15.5 22.6 L12 15.2 L19 15.2 Z" fill="#0e0e0e" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

type Cue = { t: number; kind: "click" | "key" | "cut" };
type Box = [number, number, number, number];

class Recorder {
  frame = 0;
  x = W * 0.7;
  y = H * 0.55;
  cues: Cue[] = [];
  boxes: Record<string, { t: number; box: Box }> = {};
  meta: Record<string, string> = {};
  private pressed = 0;
  private page: Page;
  private dir: string;
  constructor(page: Page, dir: string) {
    this.page = page;
    this.dir = dir;
  }

  get t(): number {
    return this.frame / FPS;
  }

  async installCursor(): Promise<void> {
    await this.page.evaluate((svg) => {
      document.getElementById("__cursor")?.remove();
      const el = document.createElement("div");
      el.id = "__cursor";
      el.innerHTML = svg;
      Object.assign(el.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none", transformOrigin: "4px 2px" });
      document.body.appendChild(el);
    }, CURSOR_SVG);
  }

  /** Lets React flush work it scheduled through MessageChannel (not faked) before the screenshot. */
  private async settle(): Promise<void> {
    await this.page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          let n = 0;
          const ch = new MessageChannel();
          ch.port1.onmessage = () => (++n >= 3 ? resolve() : ch.port2.postMessage(0));
          ch.port2.postMessage(0);
        }),
    );
  }

  async tick(): Promise<void> {
    await this.page.clock.runFor(DT);
    await this.settle();
    const scale = this.pressed > 0 ? 0.82 : 1;
    if (this.pressed > 0) this.pressed--;
    await this.page.evaluate(
      ([x, y, s]) => {
        const el = document.getElementById("__cursor");
        if (el) el.style.transform = `translate(${x - 4}px, ${y - 2}px) scale(${s})`;
      },
      [this.x, this.y, scale],
    );
    await this.page.screenshot({ path: `${this.dir}/${String(this.frame).padStart(5, "0")}.jpg`, type: "jpeg", quality: 92 });
    this.frame++;
  }

  async until(t: number): Promise<void> {
    while (this.t < t - 1e-9) await this.tick();
  }

  async hold(seconds: number): Promise<void> {
    await this.until(this.t + seconds);
  }

  async moveTo(x: number, y: number, seconds = 0.8): Promise<void> {
    const [x0, y0] = [this.x, this.y];
    const n = Math.max(1, Math.round(seconds * FPS));
    for (let i = 1; i <= n; i++) {
      const u = ease(i / n);
      this.x = x0 + (x - x0) * u;
      this.y = y0 + (y - y0) * u;
      await this.page.mouse.move(this.x, this.y);
      await this.tick();
    }
  }

  async click(): Promise<void> {
    await this.page.mouse.move(this.x, this.y);
    this.pressed = 5;
    this.cues.push({ t: this.t, kind: "click" });
    await this.page.mouse.down();
    await this.page.mouse.up();
    await this.tick();
  }

  /** Types into the focused field one character at a time, `every` frames apart. */
  async type(text: string, every = 4): Promise<void> {
    for (const ch of text) {
      this.cues.push({ t: this.t, kind: "key" });
      await this.page.keyboard.type(ch);
      for (let i = 0; i < every; i++) await this.tick();
    }
  }

  async selectAll(): Promise<void> {
    await this.page.keyboard.press("ControlOrMeta+A");
  }

  async scrollTo(y: number, seconds = 1): Promise<void> {
    const y0 = await this.page.evaluate(() => window.scrollY);
    const n = Math.max(1, Math.round(seconds * FPS));
    for (let i = 1; i <= n; i++) {
      const target = y0 + (y - y0) * ease(i / n);
      await this.page.evaluate((v) => window.scrollTo(0, v), target);
      await this.tick();
    }
  }

  /** Centre of an element in viewport coordinates. */
  async center(selector: string, dx = 0, dy = 0): Promise<[number, number]> {
    const box = await this.page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`not visible: ${selector}`);
    return [box.x + box.width / 2 + dx, box.y + box.height / 2 + dy];
  }

  /** Document y of an element's top. */
  async top(selector: string): Promise<number> {
    return this.page.locator(selector).first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  }

  /** Remembers where an element (or the union of several) is right now, as fractions of the viewport. */
  async mark(name: string, ...selectors: string[]): Promise<void> {
    let box: Box | undefined;
    for (const sel of selectors) {
      const b = await this.page.locator(sel).first().boundingBox();
      if (!b) throw new Error(`not visible: ${sel}`);
      const next: Box = [b.x / W, b.y / H, (b.x + b.width) / W, (b.y + b.height) / H];
      box = box ? [Math.min(box[0], next[0]), Math.min(box[1], next[1]), Math.max(box[2], next[2]), Math.max(box[3], next[3])] : next;
    }
    this.boxes[name] = { t: this.t, box: box!.map((v) => Math.round(v * 10_000) / 10_000) as Box };
  }

  /** Lets page time run without keeping frames until `selector` shows, then marks a cut. */
  async waitOffCamera(selector: string, timeoutMs = 180_000): Promise<number> {
    const t0 = Date.now();
    while (!(await this.page.locator(selector).first().isVisible())) {
      if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${selector}`);
      await this.page.clock.runFor(250);
      await this.page.waitForTimeout(120);
    }
    // A moment more so reads triggered by the confirmation land before the next frame.
    for (let i = 0; i < 6; i++) {
      await this.page.clock.runFor(250);
      await this.page.waitForTimeout(150);
    }
    this.cues.push({ t: this.t, kind: "cut" });
    return (Date.now() - t0) / 1000;
  }
}

async function open(page: Page, hash: string, waitFor: string): Promise<void> {
  await page.goto(`${BASE}#${hash}`);
  await page.getByText(waitFor).first().waitFor({ timeout: 60_000 });
  await page.locator(".wallet-btn").waitFor({ timeout: 60_000 });
}

const borrowInput = "label.field:has-text('Borrow') input";

const SCENES: Record<string, { frames: () => number; run: (rec: Recorder, page: Page) => Promise<void> }> = {
  borrow: {
    frames: () => scene("borrow").frames,
    async run(rec, page) {
      const id = "borrow";
      await page.locator(borrowInput).fill("25");
      await page.getByText("Lock BTC and borrow 25.00 MUSD").waitFor();
      await rec.installCursor();
      await rec.hold(1.2);
      await rec.moveTo(W * 0.62, H * 0.6, 0.4);
      await rec.scrollTo(430, 1.3);
      const [ix, iy] = await rec.center(borrowInput, -60);
      await rec.moveTo(ix, iy, 0.7);
      await rec.until(lineStart(id, 0) + 2.9);
      await rec.click();
      await rec.selectAll();
      await rec.type("25");
      await rec.mark("value", ".summary .row >> nth=0");
      await rec.mark("rate", ".specs .spec >> nth=0");
      await rec.moveTo(ix + 140, iy + 40, 0.8);
      // "Pick an amount and a ratio": try 300%, settle on 200%.
      await rec.until(lineStart(id, 1) + 0.6);
      const [c3x, c3y] = await rec.center("button.chip:text-is('300%')");
      await rec.moveTo(c3x, c3y, 0.5);
      await rec.click();
      await rec.hold(0.45);
      const [c2x, c2y] = await rec.center("button.chip:text-is('200%')");
      await rec.moveTo(c2x, c2y, 0.35);
      await rec.click();
      await rec.mark("owe", ".summary .row >> nth=3", ".summary .row >> nth=6");
      await rec.mark("ratio", ".summary-ratio");
      const [sx, sy] = await rec.center(".summary .row >> nth=4", 40);
      await rec.moveTo(sx, sy, 0.8);
      // "One transaction locks the bitcoin and sends the MUSD."
      await rec.until(lineStart(id, 2) - 0.2);
      const [bx, by] = await rec.center("button.btn-lg");
      await rec.moveTo(bx, by, 0.7);
      await rec.mark("button", "button.btn-lg");
      await rec.click();
      await rec.hold(0.5);
      const waited = await rec.waitOffCamera("text=Your micro trove");
      console.log(`  borrow confirmed after ${waited.toFixed(1)}s off camera`);
      const href = await page.locator(".toast a").last().getAttribute("href");
      if (href) rec.meta.tx = href.split("/tx/")[1];
      await rec.mark("trove", ".card:has-text('Your micro trove')");
      await rec.mark("toast", ".toast >> nth=-1");
      await rec.moveTo(W * 0.66, H * 0.42, 1.2);
      await rec.until(scene(id).seconds);
    },
  },

  lend: {
    frames: () => scene("lenders").frames - Math.round(LEND_OFFSET * FPS),
    async run(rec, page) {
      const at = (i: number) => lineStart("lenders", i) - LEND_OFFSET;
      await page.goto(`${BASE}#lend`);
      await page.getByText("Lend MUSD to bitcoin").first().waitFor({ timeout: 60_000 });
      await page.locator("text=Withdrawal queue").waitFor();
      await page.evaluate(() => window.scrollTo(0, 455));
      await rec.installCursor();
      await rec.mark("specs", ".specs");
      const depositInput = "label.field:has-text('Deposit') input";
      const [ix, iy] = await rec.center(depositInput, -40);
      rec.x = ix + 200;
      rec.y = iy - 160;
      await rec.hold(0.3);
      await rec.moveTo(ix, iy, 0.6);
      await rec.until(at(1) + 0.2);
      await rec.click();
      await rec.type("100");
      await rec.mark("deposit", ".card:has-text('Your deposit')");
      // "withdraw any time: instantly, or first in, first out"
      await rec.until(at(1) + 2.0);
      const [wx, wy] = await rec.center("text=Withdraw instantly", 0, 30);
      await rec.moveTo(wx, wy, 0.7);
      await rec.mark("instant", ".card:has-text('Your deposit') .stat >> nth=1");
      await rec.until(at(1) + 4.1);
      const [qx, qy] = await rec.center("text=Withdrawal queue", 120, 60);
      await rec.moveTo(qx, qy, 0.8);
      await rec.mark("queue", ".card:has-text('Withdrawal queue')");
      await rec.until(scene("lenders").seconds - LEND_OFFSET);
    },
  },

  // Needs the open trove from the borrow scene: the promotion card only shows for an active micro trove.
  promote: {
    frames: () => Math.round((PROMOTE_TO - PROMOTE_FROM) * FPS),
    async run(rec, page) {
      const words = (await import("../src/generated/words.json", { with: { type: "json" } })).default as Record<string, { w: string; start: number }[]>;
      const at = (word: string) => lineStart("promote", 1) + words["promote-2"].find((x) => x.w.toLowerCase().startsWith(word))!.start - PROMOTE_FROM;
      const card = ".card:has-text('Grow into a full MUSD trove')";
      await page.locator(card).waitFor();
      await page.evaluate((y) => window.scrollTo(0, y), (await rec.top(card)) - 140);
      await rec.installCursor();
      await rec.mark("card", card);
      await rec.mark("lead", `${card} p.lead`);
      await rec.mark("rows", `${card} .row >> nth=0`, `${card} .row >> nth=4`);
      await rec.mark("new", `${card} .row >> nth=0`, `${card} .row >> nth=2`);
      await rec.mark("repaid", `${card} .row >> nth=3`);
      await rec.mark("receive", `${card} .row >> nth=4`);
      const [cx, cy] = await rec.center(`${card} code`);
      rec.x = cx + 220;
      rec.y = cy + 70;
      await rec.hold(0.2);
      await rec.moveTo(cx, cy + 4, 0.6);
      await rec.until(at("opens") - 0.3);
      const [nx, ny] = await rec.center(`${card} .row >> nth=0`, 120);
      await rec.moveTo(nx, ny, 0.7);
      await rec.until(at("repays") - 0.3);
      const [rx, ry] = await rec.center(`${card} .row >> nth=3`, 120);
      await rec.moveTo(rx, ry, 0.6);
      await rec.until(at("rest") - 0.4);
      const [yx, yy] = await rec.center(`${card} .row >> nth=4`, 120);
      await rec.moveTo(yx, yy, 0.5);
      await rec.until(PROMOTE_TO - PROMOTE_FROM);
    },
  },
};

async function encode(dir: string, out: string): Promise<void> {
  const r = spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${dir}/%05d.jpg`, "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out],
    { stdio: "inherit" },
  );
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${out}`);
}

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENES);
const browser = await chromium.launch({ channel: "chrome" });
const clips = new URL("../public/clips/", import.meta.url);
mkdirSync(clips, { recursive: true });
for (const id of wanted) {
  const spec = SCENES[id];
  if (!spec) throw new Error(`unknown scene ${id}`);
  const dir = new URL(`../build/frames/${id}`, import.meta.url).pathname;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF, colorScheme: "light" });
  const page = await context.newPage();
  // Real time until the app has loaded and the burner has reconnected, then time moves only with frames.
  await page.clock.install({ time: Date.now() });
  await open(page, id === "lend" ? "lend" : "borrow", id === "lend" ? "Lend MUSD to bitcoin" : "Borrow MUSD against");
  await page.waitForTimeout(2500);
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 200);
  const rec = new Recorder(page, dir);
  const t0 = Date.now();
  await spec.run(rec, page);
  if (rec.frame !== spec.frames()) console.warn(`  ${id}: recorded ${rec.frame} frames, scene wants ${spec.frames()}`);
  await context.close();
  await encode(dir, new URL(`${id}.mp4`, clips).pathname);
  writeFileSync(new URL(`${id}.json`, clips), JSON.stringify({ frames: rec.frame, cues: rec.cues, boxes: rec.boxes, ...rec.meta }, null, 2));
  console.log(`${id}: ${rec.frame} frames (${(rec.frame / FPS).toFixed(1)}s) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
await browser.close();
