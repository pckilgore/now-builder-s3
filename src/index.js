/* eslint-disable no-console */
const execa = require("execa");
const path = require("path");
// const glob = require("@now/build-utils/fs/glob");
const download = require("@now/build-utils/fs/download");

exports.analyze = ({ entrypoint, files }) => files[entrypoint].digest;

exports.build = async ({ config, entrypoint, files, workPath }) => {
  const downloadedFiles = await download(files, workPath);

  const { PATH, HOME } = process.env;

  // Make sure your providers' config vars are secrets passed in as ENV vars.
  // See https://zeit.co/docs/v2/deployments/environment-variables-and-secrets
  const terraformEnv = {
    ...process.env,
    PATH: `${path.join(HOME)}:${PATH}`
  };

  const entrypointDirname = path.dirname(downloadedFiles[entrypoint].fsPath);

  const setupEnv = {
    env: terraformEnv,
    cwd: entrypointDirname,
    stdio: "inherit"
  };

  console.log("Creating test file.");
  try {
    await execa("echo", ["Test file", ">>", "test.txt"], setupEnv);
  } catch (err) {
    console.error("Test file creation failed");
    throw err;
  }
  console.log("Test zip");
  try {
    await execa("zip", ["test.zip", "test.txt"], setupEnv);
  } catch (err) {
    console.error("Terraform validate failed!");
    throw err;
  }
  try {
    await execa("ls", ["-a"], setupEnv);
  } catch (err) {
    console.error("Cannot list files!");
    throw err;
  }
};

// exports.prepareCache = async ({ cachePath, entrypoint, workPath }) => {
//   console.log("preparing cache...");
//   return {
//     ...(await glob(".terraform/**", workPath))
//   };
// };
