const fs = require("fs");
const path = require("path");
const retry = require("retry");
const glob = require("@now/build-utils/fs/glob");

// TODO: use native zip lib,
// ref: https://github.com/zeit/docs/issues/520
const archiver = require("archiver");

/**
 * Don't write to nothing.  Can be replaced with mkdir({recursive: true}) when
 * node >- 10
 *
 * @param {string} filePath
 */
function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

/**
 * Packages local files into a ZIP archive
 *
 * @param {string} pathToZip directory of source files.
 * @param {string} zipName the zip archive file name
 * @param {string=} outputDir output directory, defaults to `./ready/`
 */
function zipFiles(pathToZip, zipName, outputDir = "./ready/") {
  const archive = new archiver("zip");
  const outputFilePath = outputDir + zipName + ".zip";
  console.log(`Preparing to zip ${pathToZip} to ${outputFilePath}`);

  console.log("Making sure directory exists...");
  ensureDirectoryExistence(outputFilePath);
  console.log("...OK!");

  return new Promise((resolve, reject) => {
    console.log("Creating stream to output file...");
    const output = fs.createWriteStream(outputFilePath);
    archive.pipe(output);
    console.log("...OK!");

    // Process events...
    archive.on("entry", entry => console.log("adding", entry.name));
    archive.on("warning", err => console.warn(err));
    archive.on("error", err => reject(err));
    archive.on("finish", () => {
      console.log(`...compression complete at ${new Date().toISOString()}.`);
      resolve(outputFilePath);
    });

    console.log(`Starting compression at ${new Date().toISOString()}...`);
    archive.directory(pathToZip, false);

    archive.finalize();
  });
}

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
        if (operation.retry(err)) return;
        if (err) reject(operation.mainError());
        resolve(data);
      });
    });
  });
}

module.exports = {
  zipFiles,
  ensureDirectoryExistence,
  bucketAvailable
};
