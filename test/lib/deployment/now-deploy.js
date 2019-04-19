const assert = require("assert");
const { createHash } = require("crypto");
const { homedir } = require("os");
const path = require("path");
const fetch = require("./fetch-retry.js");

async function nowDeploy (bodies, randomness) {
  const files = Object.keys(bodies)
    .filter((n) => n !== "now.json")
    .map((n) => ({
      sha: digestOfFile(bodies[n]),
      size: bodies[n].length,
      file: n,
      mode: path.extname(n) === ".sh" ? 0o100755 : 0o100644
    }));

  const nowJson = JSON.parse(bodies["now.json"]);

  const nowDeployPayload = {
    version: 2,
    public: true,
    env: { ...nowJson.env, RANDOMNESS_ENV_VAR: randomness },
    build: {
      env: {
        ...(nowJson.build || {}).env,
        RANDOMNESS_BUILD_ENV_VAR: randomness
      }
    },
    name: "test",
    files,
    builds: nowJson.builds,
    routes: nowJson.routes || [],
    meta: {}
  };

  console.log(`posting ${files.length} files`);

  for (const { file: filename } of files) {
    await filePost(bodies[filename], digestOfFile(bodies[filename]));
  }

  let deploymentId;
  let deploymentUrl;

  {
    const json = await deploymentPost(nowDeployPayload);
    if (json.error && json.error.code === "missing_files")
      throw new Error("Missing files");
    deploymentId = json.id;
    deploymentUrl = json.url;
  }

  console.log("id", deploymentId);

  for (let i = 0; i < 500; i += 1) {
    const { state } = await deploymentGet(deploymentId);
    if (state === "ERROR")
      throw new Error(`State of ${deploymentUrl} is ${state}`);
    if (state === "READY") break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  return { deploymentId, deploymentUrl };
}

function digestOfFile (body) {
  return createHash("sha1")
    .update(body)
    .digest("hex");
}

async function filePost (body, digest) {
  assert(Buffer.isBuffer(body));

  const headers = {
    "Content-Type": "application/octet-stream",
    "Content-Length": body.length,
    "x-now-digest": digest,
    "x-now-size": body.length
  };

  const resp = await fetchWithAuth("/v2/now/files", {
    method: "POST",
    headers,
    body
  });
  const json = await resp.json();

  if (json.error) {
    console.log("headers", resp.headers);
    throw new Error(json.error.message);
  }
  return json;
}

async function deploymentPost (payload) {
  const resp = await fetchWithAuth("/v6/now/deployments?forceNew=1", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const json = await resp.json();

  if (json.error) {
    console.log("headers", resp.headers);
    throw new Error(json.error.message);
  }
  return json;
}

async function deploymentGet (deploymentId) {
  const resp = await fetchWithAuth(`/v3/now/deployments/${deploymentId}`);
  return await resp.json();
}

let token;
let currentCount = 0;
const MAX_COUNT = 10;

async function fetchWithAuth (url, opts = {}) {
  if (!opts.headers) opts.headers = {};

  if (!opts.headers.Authorization) {
    const { NOW_TOKEN, NOW_TOKEN_FACTORY_URL } = process.env;
    currentCount += 1;
    if (!token || currentCount === MAX_COUNT) {
      currentCount = 0;
      if (NOW_TOKEN) {
        token = NOW_TOKEN;
      } else if (NOW_TOKEN_FACTORY_URL) {
        const resp = await fetch(NOW_TOKEN_FACTORY_URL);
        token = (await resp.json()).token;
      } else {
        const authJsonPath = path.join(homedir(), ".now/auth.json");
        token = require(authJsonPath).token;
      }
    }

    opts.headers.Authorization = `Bearer ${token}`;
  }

  return await fetchApi(url, opts);
}

async function fetchApi (url, opts = {}) {
  const apiHost = process.env.API_HOST || "api.zeit.co";
  const urlWithHost = `https://${apiHost}${url}`;
  const { method = "GET", body } = opts;

  if (process.env.VERBOSE) {
    console.log("fetch", method, url);
    if (body) console.log(encodeURIComponent(body).slice(0, 80));
  }

  if (!opts.headers) opts.headers = {};

  if (!opts.headers.Accept) {
    opts.headers.Accept = "application/json";
  }

  opts.headers["x-now-trace-priority"] = "1";

  return await fetch(urlWithHost, opts);
}

module.exports = {
  fetchApi,
  fetchWithAuth,
  nowDeploy
};
