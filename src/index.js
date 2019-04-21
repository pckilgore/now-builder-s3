/* eslint-disable no-console */
const path = require("path");
const AWS = require("aws-sdk");
const download = require("@now/build-utils/fs/download");
const glob = require("@now/build-utils/fs/glob");
const { zipFiles, bucketAvailable } = require("./utils");
const fs = require("fs");

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
exports.build = async ({
  config: {
    //Required config
    Bucket,
    // Optional args
    objectPath = "",
    region: configRegion,
    lambda = false,
    s3Params
  },
  entrypoint,
  files,
  workPath
}) => {
  // Setup S3 sdk
  const region = configRegion || process.env.AWS_REGION;
  const s3 = new AWS.S3({ apiVersion: "2006-03-01", region });

  // If we're uploading a lambda, download to a tmp folder for zipping.
  // If not, move all the files straight to the dist folder for upload.
  const downloadPath = workPath + (lambda ? "/processing" : "/ready");

  // Start download while we're waiting for our bucket.
  const downloadPromise = download(files, downloadPath);

  try {
    // Wait for the bucket to be available via exponential backoff.
    // Allows time for a new bucket to be created if necessary in the same
    // deploy through, e.g., Cloudformation or Terraform
    console.log(`Checking bucket ${Bucket} accessible and exists...`);
    await bucketAvailable(s3, { ...s3Params, Bucket });
    console.log("...success!");

    // Meanwhile...have we downloaded everything?
    await downloadPromise;
  } catch (error) {
    console.error(error);
  }

  // Prepare working environment.
  if (lambda) {
    console.log("Detected lambda, compressing...");
    !lambda.name && console.warn("Missing lambda name.  Using hash...");

    try {
      await zipFiles(
        downloadPath,
        lambda.name || `${files[entrypoint].digest}.zip`,
        workPath + "/ready/"
      );
    } catch (error) {
      console.error("There was an error compressing the file(s)", error);
    }
  }

  const readyFiles = await glob("**", workPath + "/ready");

  Object.entries(readyFiles).forEach(async ([file, details]) => {
    const data = await new Promise((resolve, reject) => {
      fs.readFile(details.fsPath, function(err, fileData) {
        if (err) reject(err);
        resolve(fileData);
      });
    });
    const relativePath = path.relative(workPath + "/ready", details.fsPath);
    const resolvedPath = path.join(objectPath, relativePath);
    s3.putObject(
      { Bucket, ...s3Params, Key: resolvedPath, Body: data },
      (err, res) => {
        if (err) throw err;
        console.log(`Uploaded ${objectPath} to S3 successfully`, res);
      }
    );
  });
};

exports.prepareCache = async ({ workPath }) => {
  console.log("preparing cache...");
  return {
    ...(await glob("./node_modules/**", workPath))
  };
};
