// A scripted Unisat-compatible Bitcoin wallet for the passport footage. It signs Bitcoin messages
// (BIP-137, P2WPKH) with a throwaway testnet key that capture.ts keeps in video/build/passport-key
// (git-ignored) and hands to the page through localStorage. It never sends bitcoin.
// Loaded as a module inside the dev app, so it borrows viem from Vite's pre-bundled deps at __BASE__.

const viem = await import("__BASE__node_modules/.vite/deps/viem.js");
const accounts = await import("__BASE__node_modules/.vite/deps/viem_accounts.js");
const { sha256, ripemd160, hexToBytes, bytesToHex } = viem;

const pk = localStorage.getItem("microtrove.btc-video-key");
const account = accounts.privateKeyToAccount(pk);
const full = hexToBytes(account.publicKey);
const compressed = new Uint8Array(33);
compressed[0] = full[64] & 1 ? 3 : 2;
compressed.set(full.slice(1, 33), 1);
const h160 = ripemd160(sha256(compressed, "bytes"), "bytes");

// Bech32 for a v0 witness program (BIP-173).
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const polymod = (values) => {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= G[i];
  }
  return chk;
};
const hrpExpand = (h) => [...[...h].map((c) => c.charCodeAt(0) >> 5), 0, ...[...h].map((c) => c.charCodeAt(0) & 31)];
const convertBits = (data, from, to) => {
  let acc = 0;
  let bits = 0;
  const out = [];
  const max = (1 << to) - 1;
  for (const v of data) {
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & max);
    }
  }
  if (bits > 0) out.push((acc << (to - bits)) & max);
  return out;
};
const encode = (hrp, version, program) => {
  const data = [version, ...convertBits(program, 8, 5)];
  const mod = polymod([...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = [0, 1, 2, 3, 4, 5].map((i) => (mod >> (5 * (5 - i))) & 31);
  return hrp + "1" + [...data, ...checksum].map((d) => CHARSET[d]).join("");
};

const address = encode("tb", 0, [...h160]);
const pubHex = bytesToHex(compressed).slice(2);

const magicHash = (message) => {
  const enc = new TextEncoder();
  const prefix = enc.encode("\x18Bitcoin Signed Message:\n");
  const msg = enc.encode(message);
  const buf = new Uint8Array(prefix.length + 1 + msg.length);
  buf.set(prefix, 0);
  buf[prefix.length] = msg.length;
  buf.set(msg, prefix.length + 1);
  return sha256(sha256(buf, "bytes"), "bytes");
};

window.__btcSigned = [];
window.unisat = {
  requestAccounts: async () => [address],
  getAccounts: async () => [address],
  getPublicKey: async () => pubHex,
  getBalance: async () => ({ confirmed: 0, unconfirmed: 0, total: 0 }),
  getNetwork: async () => "testnet",
  signMessage: async (message) => {
    const sig = await accounts.sign({ hash: bytesToHex(magicHash(message)), privateKey: pk });
    // BIP-137 header for a compressed key: 31 + recovery id. Mezo's smart account accepted this in testing.
    const out = new Uint8Array(65);
    out[0] = 31 + Number(sig.yParity);
    out.set(hexToBytes(sig.r), 1);
    out.set(hexToBytes(sig.s), 33);
    window.__btcSigned.push(message);
    return btoa(String.fromCharCode(...out));
  },
  sendBitcoin: async () => {
    throw new Error("The scripted wallet does not send bitcoin.");
  },
  on() {},
  removeListener() {},
};
window.__btcAddress = address;
