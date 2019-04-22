provider "aws" {
  version = "~> 2.6"
  region  = "us-east-2"
  profile = "default"
}

resource "aws_s3_bucket" "terraform-state-s3-store" {
  bucket = "now-builder-s3-tfstate"

  versioning {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }

  tags {
    Name       = "S3 Remote Terraform State Store"
    opensource = "now-builder-s3"
    env        = "test"
  }
}

resource "aws_s3_bucket_public_access_block" "terraform-state-s3-store-access-policy" {
  bucket = "${aws_s3_bucket.terraform-state-s3-store.id}"

  block_public_acls       = true
  block_public_policy     = true
  restrict_public_buckets = true
  ignore_public_acls      = true
}

resource "aws_dynamodb_table" "terraform-state-dynamodb-lock" {
  name         = "now-builder-s3-terraform-state-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags {
    Name       = "DynamoDB Terraform State Lock Table"
    opensource = "now-builder-s3"
    env        = "test"
  }
}
