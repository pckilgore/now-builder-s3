# Terraform Management

These files manage the resources where the remote state for the actual application infrastructure is stored.

To avoid an infinite loop, I keep the local state for this project in git.

Normally this is a bad idea, as the `tfstate` file can contain keys, and you have to remember to check them in after running `.tfapply`.

But since I have control of my own keys, I don't have to worry about contributors ever disturbing the AWS resources (for now).

Anywaaaay, I publish this and other terraform files so anyone can reproduce the resources for this project's testing harness, etc.
