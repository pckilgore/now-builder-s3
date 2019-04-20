/* eslint-disable no-console */
const execa = require("execa");
const path = require("path");
const AWS = require("aws-sdk");
const download = require("@now/build-utils/fs/download");
const glob = require("@now/build-utils/fs/glob");
const retry = require("retry");

/**
 * Hash the entry point to de-dupe builds.
 */
exports.analyze = ({ entrypoint, files }) => files[entrypoint].digest;

/**
 * Build.
 *
 * Make sure to set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
 * environment variables.  They are automatically picked up by the SDK.
 *
 * Set the bucket region with the build config or the AWS_REGION env var.
 */
exports.build = async ({ config = {}, entrypoint, files, workPath }) => {
  // Setup S3 sdk
  const region = config.region || process.env.AWS_REGION;
  const s3 = new AWS.S3({ apiVersion: "2006-03-01", region });
  const params = { Bucket: config.Bucket };
  console.log("Booting...", region, params);
  try {
    // Wait for the bucket to be available.
    // Allows time for a new bucket to be created if necessary
    // through, e.g., Cloudformation or Terraform
    const data = await bucketAvailable(s3, params);
    console.log("Found bucket!", data);
  } catch (error) {
    console.error(error);
  }

  // Prepare working environment.
  const downloadedFiles = await download(files, workPath);
  const entryPointDir = path.dirname(downloadedFiles[entrypoint].fsPath);
  const setupEnv = { env: process.env, cwd: entryPointDir, stdio: "inherit" };

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

/**
 *  Make sure the bucket exists, or wait for it to be created.
 *
 * @param {*} s3
 * @param {*} params
 */
async function bucketAvailable(s3, params) {
  console.log("Looking for Bucket with params:", params);
  // Setup exponential backoff
  const operation = retry.operation({ minTimeout: 200, randomize: true });
  // Verify bucket exists
  return new Promise((resolve, reject) => {
    operation.attempt(attempts => {
      console.log(
        `Attempt ${attempts} to contact S3 bucket at ${new Date().toLocaleString()}...`
      );
      s3.headBucket(params, (err, data) => {
        console.log("Error", err);
        console.log("data", data);
        if (operation.retry(err)) return;
        if (err) reject(operation.mainError());
        resolve(data);
      });
    });
  });
}
// exports.prepareCache = async ({ cachePath, entrypoint, workPath }) => {
//   console.log("preparing cache...");
//   return {
//     ...(await glob(".terraform/**", workPath))
//   };
// };
