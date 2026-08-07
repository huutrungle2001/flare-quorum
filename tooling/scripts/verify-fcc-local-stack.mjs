import {
  evaluateLocalFccMachineSet,
  verifyLocalFccStack,
} from "../flare/local-fcc-stack.mjs";

const expectedOwner = process.env.FCC_INITIAL_OWNER ??
  "0xE412d04DA2A211F7ADC80311CC0FF9F03440B64E";
const expectedExtensionId = process.env.FCC_EXTENSION_ID ??
  `0x${"0".repeat(59)}10000`;

const results = [];
for (const machine of [1, 2, 3]) {
  results.push(await verifyLocalFccStack({
    baseUrl: process.env[`FCC_PROXY_LOCAL_URL_${machine}`] ??
      `http://127.0.0.1:${6673 + machine}/`,
    apiKey: process.env[`FCC_DIRECT_API_KEY_${machine}`],
    expectedExtensionId,
    expectedOwner,
  }));
}
const result = evaluateLocalFccMachineSet(results);

console.log(JSON.stringify(result, null, 2));
if (result.status !== "PASSED") process.exitCode = 1;
