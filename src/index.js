/* eslint-disable no-console */
const path = require("path");
const AWS = require("aws-sdk");
const {
  glob,
  download,
  runNpmInstall,
  runPackageJsonScript
} = require("@now/build-utils");
const { zipFiles, bucketAvailable, validateDistDir } = require("./utils");
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
    lambda = false, // : { name?: String, build?: Boolean, distDir }
    s3Params
  },
  entrypoint,
  files,
  workPath
}) => {
  if (lambda.build && path.basename(entrypoint) !== "package.json") {
    console.error("This builder only supports building from a package.json");
    console.error("Have a different use case?  Let's discuss @ github!");
    console.error("https://github.com/pckilgore/now-builder-s3/issues");
    throw Error("UNSUPPORTED BUILD ENTRYPOINT");
  }

  // Setup S3 sdk
  const region = configRegion || process.env.AWS_REGION;
  const s3 = new AWS.S3({ apiVersion: "2006-03-01", region });

  // If we're uploading a lambda, download to a tmp folder for zipping.
  // If not, move all the files straight to the ready folder for upload.
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

  // If your entry point is a package JSON, I assume you want to install stuff.
  if (lambda && path.basename(entrypoint) === "package.json") {
    console.log("Lambda has dependencies.  Installing...");
    const mountpoint = path.dirname(entrypoint);
    const entrypointFsDirname = path.join(downloadPath, mountpoint);
    await runNpmInstall(entrypointFsDirname, ["--prefer-offline"]);
    console.log("...done!");

    if (lambda.build) {
      console.log("Lambda requires build step...");
      const distPath = path.join(
        workPath,
        "processing",
        mountpoint,
        (lambda && lambda.distDir) || "dist"
      );

      try {
        if (await runPackageJsonScript(entrypointFsDirname, "now-build")) {
          console.log("...build complete!");
          validateDistDir(distPath);
          !lambda.name && console.warn("Missing lambda name.  Using hash...");
          await zipFiles(
            distPath,
            lambda.name || `${files[entrypoint].digest}.zip`,
            workPath + "/ready/"
          );
        }
      } catch (error) {
        console.error(error);
        throw new Error(
          `An error running "now-build" script in "${entrypoint}"`
        );
      }
    }
  }

  // Or just zip up the script and its deps.
  if (lambda && !lambda.build) {
    console.log("Compressing lambda...");
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

  // eslint-disable-next-line no-unused-vars
  Object.values(readyFiles).forEach(async details => {
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

exports.prepareCache = async ({ workPath, entrypoint, config }) => {

  if (config.noCache) return

  return {
    ...(path.basename(entrypoint) === "package.json" &&
      (await glob("processing/node_modules/**", workPath)))
  };
};
