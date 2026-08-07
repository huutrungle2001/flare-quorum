import { verifyLocalFccStack } from "../flare/local-fcc-stack.mjs";

const expectedOwner = process.env.FCC_INITIAL_OWNER ??
  "0xE412d04DA2A211F7ADC80311CC0FF9F03440B64E";
const expectedExtensionId = process.env.FCC_EXTENSION_ID ??
  `0x${"0".repeat(59)}10000`;

const result = await verifyLocalFccStack({
  baseUrl: process.env.FCC_PROXY_LOCAL_URL ?? "http://127.0.0.1:6674/",
  apiKey: process.env.FCC_DIRECT_API_KEY,
  expectedExtensionId,
  expectedOwner,
});

console.log(JSON.stringify(result, null, 2));
if (result.status !== "PASSED") process.exitCode = 1;
