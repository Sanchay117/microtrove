# Microtrove demo video

The pitch video (2:51 for Wave 2): motion graphics in [Remotion](https://www.remotion.dev), footage of the live app recorded with Playwright, and narration from Deepgram Aura-2. Sound effects and music are synthesized from code, so nothing needs a license.

## Pipeline

| Step | Command | What it does |
| --- | --- | --- |
| 1 | `npm run tts` | Speaks each line of [src/narration.ts](src/narration.ts) and writes `src/generated/timing.json`. Unchanged lines are reused. |
| 2 | `npm run check-tts` | Transcribes the narration back, to catch misread numbers and names. |
| 3 | `npm run words` | Word timestamps, so graphics land on the word being spoken. |
| 4 | `npm run capture` | Records the app frame by frame at 2400×1350. Needs `web` running in dev mode on port 5195. |
| 5 | `npm run sfx` | Synthesizes the sound effects and the music bed. |
| 6 | `npm run render` | Renders `out/microtrove.mp4`. `npm run studio` previews it. |
| 7 | `npm run master` | Normalizes loudness to −16 LUFS: `out/microtrove-final.mp4`. |
| 8 | `npm run check-mix` | Transcribes the final mix, to check the music never masks the voice. |
| 9 | `npm run thumb` | Renders the cover, [src/Thumbnail.tsx](src/Thumbnail.tsx): `out/thumbnail-1920.png` and `out/thumbnail-1280.png`. |

Steps 1, 2, 3 and 8 need `DEEPGRAM_API_KEY` in `video/.env` (git-ignored). The narration and the app clips are committed, since they cost an API call or a testnet transaction to make again; run `npm run sfx` after cloning to rebuild the music and effects.

## The footage is real

`npm run capture borrow` opens a real 25 MUSD loan on Mezo Testnet from the dev burner wallet (`web/.env.development.local`), so the burner must have no open trove and about 0.001 BTC. The promote clip needs that loan open, since the promotion card only shows for an active micro trove. Times in the page advance exactly one frame per screenshot under Playwright's fake clock; while the transaction confirms, time runs without keeping frames, and the composition covers that cut with a flash.

`npm run capture passport` borrows 25 MUSD from a Bitcoin wallet through Mezo Passport. The wallet is [scripts/btc-wallet.js](scripts/btc-wallet.js), a scripted Unisat that signs Bitcoin messages with a throwaway testnet key kept in `build/passport-key` (git-ignored). Its smart account needs about 0.0015 BTC; the first run prints the address to fund and stops. The connect and the relayed borrow happen off camera, covered by flashes like the borrow scene's.

The first-loan guide is hidden during capture so the footage frames the loan form.

The keeper and claim scenes use the real log and transaction hashes from the expiry run described in [keeper/README.md](../keeper/README.md). They ran on the Wave 1 contracts; everything else on screen is the Wave 2 deployment.

## End card links

`LINKS` and `FACTS` in [src/data.ts](src/data.ts) hold the links and addresses on the end card; re-render (steps 6 and 7) after changing them.
