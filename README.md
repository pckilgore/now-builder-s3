# :cyclone: now-builder-s3

[![Status](https://travis-ci.com/pckilgore/now-builder-s3.svg?branch=master)](https://travis-ci.com/pckilgore/now-builder-s3)[![npm version](http://img.shields.io/npm/v/@pckilgore/now-builder-s3.svg?style=flat)](https://npmjs.org/package/@pckilgore/now-builder-s3 "View this project on npm")

Deploy your files and AWS lambdas to AWS S3 using now.sh builders.

Supports arbitary files, Buckets, and bucket paths.

Compile, minify, and/or bundle your lambdas (or push them as is with dependiencies)!

## Use Cases

Handles:

- Uploading one or many files/objects.
- _Zipping_ one or many objects, and then uploading:
  - **Deploy pre-compiled or no-compile AWS lambda functions!**
- Building, zipping, and uploading javascript projects:
  - **Upload a node JS project, build in the cloud, and deploy as an AWS lambda!**

## Examples

See [these fixtures](test/fixtures/) for real-life examples!

### Upload arbitary folder of stuff

**Note:** entry point must be a file, but the builder will upload _all files_ in the directory of the entry point.

`now.json`

```jsonc
{
  "version": 2,
  "build": {
    "env": {
      "AWS_ACCESS_KEY_ID": "@now_s3_iam_access_key",
      "AWS_SECRET_ACCESS_KEY": "@now_s3_iam_secret_key",
      "AWS_REGION": "us-east-2"
    }
  },
  "builds": [
    {
      "src": "./arbitrary-stuff/index.txt",
      "use": "@pckilgore/now-builder-s3",
      "config": {
        "Bucket": "your bucket",
        "objectPath": "an-arbitrary/nested/path/to/put/object" // (not required)
      }
    }
  ]
}
```

### Upload a simple lambda

All files in the entry point's directory will be zipped (go ahead and deploy python lambdas, or a compiled go lambda!).

`now.json`

```jsonc
{
  "version": 2,
  "build": {
    "env": {
      /*see above*/
    }
  },
  "builds": [
    {
      "src": "src/index.js",
      "use": "@pckilgore/now-builder-s3",
      "config": {
        "Bucket": "test",
        "lambda": { "name": "my-lambda-fn" }
        // will upload to test/my-lambda-fn.zip
      }
    }
  ]
}
```

`src/index.js`

```js
const one = require("./some-module");

exports.handler = (evt, ctx) => one();
```

`src/some-module.js`

```js
module.exports = () => 1;
```

### Upload a lambda (build before zipping/deploying)

If you set a `package.json` file as the entry point, your dependiencies will be installed before compressing and uploading. (So your uploaded zip will contain all your node_modules!)

If you set `config.lambda.build` to true, the builder will run your `scripts.now-build` script. It will then _only_ zip and upload the files in your `config.build.distDir` folder (defaults to `dist/` if not provided).

`now.json`

```jsonc
{
  "version": 2,
  "build": {
    "env": {
      /* see above*/
    }
  },
  "builds": [
    {
      "src": "package.json",
      "use": "@pckilgore/now-builder-s3",
      "config": {
        "Bucket": "now-builder-s3-test",
        "lambda": {
          "name": "06-compiled-lambda",
          "build": true,
          "distDir": "arbitrary/"
        },
        "objectPath": "06-compiled-lambda/whynotasubfolder/"
      }
    }
  ]
}
```

## Future plans

Import and compose, rather than duplicate, official builders.

Let me know what your use cases are for this!

Right now, I use it to deploy AWS lambdas that manage features now.sh cannot yet
provide (cloudwatch, SNS, SQS, etc...).
