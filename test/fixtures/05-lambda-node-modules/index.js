const leftPad = require("left-pad");

exports.handler = async (evt, ctx) => {
  console.log(leftPad("1", 10));
  return true;
};
