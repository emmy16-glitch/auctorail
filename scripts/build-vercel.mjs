import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const output = join(root, ".vercel", "output");
const staticOutput = join(output, "static");
const paymentFunction = join(output, "functions", "api-payment.func");
const utilityFunction = join(output, "functions", "api-utility.func");

rmSync(output, { recursive: true, force: true });
mkdirSync(staticOutput, { recursive: true });
mkdirSync(paymentFunction, { recursive: true });
mkdirSync(utilityFunction, { recursive: true });

execFileSync("npm", ["run", "web:build"], { cwd: root, stdio: "inherit" });
cpSync(join(root, "dist"), staticOutput, { recursive: true });

function deploymentPrelude() {
  const bundleSource = readFileSync(join(root, "web", "api-bundle.ts"), "utf8");
  const marker = 'await import("./api.js")';
  const markerIndex = bundleSource.indexOf(marker);
  if (markerIndex < 0) throw new Error("Auctorail deployment prelude marker not found");
  return bundleSource.slice(0, markerIndex).trimEnd();
}

function makeVercelHandler(sourcePath, temporaryPath, prelude) {
  const source = readFileSync(sourcePath, "utf8");
  const marker = 'server.listen(PORT, "0.0.0.0"';
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`Vercel adapter marker not found in ${sourcePath}`);
  }

  const adapted = `${prelude}\n\n${source.slice(0, markerIndex)}
export default function handler(request, response) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      resolve(undefined);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    response.once("finish", settle);
    response.once("close", settle);
    response.once("error", fail);

    try {
      server.emit("request", request, response);
    } catch (error) {
      fail(error);
    }
  });
}
`;

  writeFileSync(temporaryPath, adapted);
}

const prelude = deploymentPrelude();
const paymentSource = join(root, "web", "api.ts");
const utilitySource = join(root, "web", "security-lab-api.ts");
const paymentTemp = join(root, "web", "__vercel-payment.ts");
const utilityTemp = join(root, "web", "__vercel-utility.ts");

try {
  makeVercelHandler(paymentSource, paymentTemp, prelude);
  makeVercelHandler(utilitySource, utilityTemp, prelude);

  execFileSync(
    "npx",
    [
      "esbuild",
      paymentTemp,
      "--bundle",
      "--platform=node",
      "--format=cjs",
      "--target=node24",
      `--outfile=${join(paymentFunction, "index.js")}`
    ],
    { cwd: root, stdio: "inherit" }
  );

  execFileSync(
    "npx",
    [
      "esbuild",
      utilityTemp,
      "--bundle",
      "--platform=node",
      "--format=cjs",
      "--target=node24",
      `--outfile=${join(utilityFunction, "index.js")}`
    ],
    { cwd: root, stdio: "inherit" }
  );
} finally {
  rmSync(paymentTemp, { force: true });
  rmSync(utilityTemp, { force: true });
}

const functionConfig = {
  runtime: "nodejs24.x",
  handler: "index.js",
  launcherType: "Nodejs",
  shouldAddHelpers: true,
  shouldAddSourcemapSupport: true,
  maxDuration: 60
};

writeFileSync(join(paymentFunction, ".vc-config.json"), JSON.stringify(functionConfig, null, 2));
writeFileSync(join(utilityFunction, ".vc-config.json"), JSON.stringify(functionConfig, null, 2));

const dataDirectory = join(root, "data");
if (existsSync(dataDirectory)) {
  cpSync(dataDirectory, join(paymentFunction, "data"), { recursive: true });
  cpSync(dataDirectory, join(utilityFunction, "data"), { recursive: true });
}

writeFileSync(
  join(output, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: "^/api/(?:security-lab|content-check|verify-proof)$",
          dest: "/api-utility"
        },
        {
          src: "^/api(?:/.*)?$",
          dest: "/api-payment"
        },
        { handle: "filesystem" },
        { src: "/.*", dest: "/index.html" }
      ]
    },
    null,
    2
  )
);

console.log("Auctorail Vercel Build Output API package ready.");
