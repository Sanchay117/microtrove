// Listens to the generated narration with Deepgram speech-to-text, to catch misread abbreviations and
// numbers without a human in the loop. Prints script against transcript for each line.
// Usage: node scripts/check-tts.ts [scene]

import { readFileSync } from "node:fs";
import { deepgramKey, readTiming } from "./env.ts";

const key = deepgramKey();
const only = process.argv[2];

for (const scene of readTiming().scenes) {
  if (only && scene.id !== only) continue;
  for (const line of scene.lines) {
    const audio = readFileSync(new URL(`../public/${line.file}`, import.meta.url));
    // Key terms bias recognition towards product names, so a consistent pronunciation reads back as written.
    const r = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&keyterm=Mezo&keyterm=MUSD&keyterm=Microtrove", {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "audio/wav" },
      body: audio,
    });
    const j = (await r.json()) as { results?: { channels: { alternatives: { transcript: string }[] }[] } };
    const heard = j.results?.channels[0]?.alternatives[0]?.transcript ?? `(error ${r.status})`;
    console.log(`${line.file}\n  script: ${line.text}\n  heard:  ${heard}`);
  }
}
