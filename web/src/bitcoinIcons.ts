// Wallet logos that ship with Mezo's OrangeKit. Loaded with the wallet menu, not on page load.
import unisat from "@mezo-org/orangekit/dist/src/wallet/unisat/icon.js";
import okx from "@mezo-org/orangekit/dist/src/wallet/okx/icon.js";
import xverse from "@mezo-org/orangekit/dist/src/wallet/xverse/icon.js";
import type { BitcoinWalletId } from "./bitcoin";

const icons: Record<BitcoinWalletId, string> = {
  "orangekit-unisat": unisat,
  "orangekit-okx": okx,
  "orangekit-xverse": xverse,
};

export default icons;
