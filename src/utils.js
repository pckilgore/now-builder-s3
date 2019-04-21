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
async function zipFiles(pathToZip, zipName, outputDir = "./ready/") {
  console.log(pathToZip, zipName, outputDir);
  const filesToZip = await glob("**", pathToZip);
  const fileArray = Object.entries(filesToZip);
  const archive = archiver("zip");
  const outputFilePath = outputDir + zipName + ".zip";

  ensureDirectoryExistence(outputFilePath);
  const output = fs.createWriteStream(outputFilePath);

  archive.pipe(output);

  fileArray.forEach(([file, details]) => {
    console.log("processing", file, details);
    archive.append(fs.createReadStream(details.fsPath), { name: file });
  });

  return new Promise((resolve, reject) => {
    archive.finalize((err, written) => {
      if (err) reject(err);
      resolve({ outputFilePath, written });
    });
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
