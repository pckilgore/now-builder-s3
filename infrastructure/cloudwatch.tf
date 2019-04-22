resource "aws_s3_bucket" "test_deploy_bucket" {
  bucket = "now-builder-s3-test"

  tags {
    Name       = "Deploy location for tests of now-builder-s3"
    opensource = "now-builder-s3"
    env        = "test"
  }
}

resource "aws_s3_bucket_public_access_block" "terraform-state-s3-store-access-policy" {
  bucket = "${aws_s3_bucket.test_deploy_bucket.id}"

  block_public_acls       = true
  block_public_policy     = true
  restrict_public_buckets = true
  ignore_public_acls      = true
}

resource "aws_iam_policy" "now_builder_s3_iam_policy" {
  name        = "opensource.now-builder-s3-test-bucket"
  description = "Gives permissions to deploy test files to the test S3 bucket."

  policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::now-builder-s3-test"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::now-builder-s3-test/*"
      ]
    }
  ]
}
EOF
}

resource "aws_iam_user" "now_test_deploy_user" {
  name                 = "opensource.now-testing-user"
  permissions_boundary = "${aws_iam_policy.now_builder_s3_iam_policy.arn}"

  tags {
    Name       = "Deploy user for builder testing"
    opensource = "now-builder-s3"
    env        = "test"
  }
}

resource "aws_iam_access_key" "now_test_deploy_key" {
  user    = "${aws_iam_user.now_test_deploy_user.name}"
  pgp_key = "keybase:patrickkilgore"
}

resource "aws_iam_user_policy_attachment" "attach_policy_testing_user" {
  user       = "${aws_iam_user.now_test_deploy_user.name}"
  policy_arn = "${aws_iam_policy.now_builder_s3_iam_policy.arn}"
}

output "keys_encrypting_fingerprint" {
  value = "${aws_iam_access_key.now_test_deploy_key.key_fingerprint}"
}

output "keys_secret_enc" {
  sensitive = true
  value     = "${aws_iam_access_key.now_test_deploy_key.encrypted_secret}"
}
