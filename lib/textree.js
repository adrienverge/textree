
var nodegit = require("nodegit");

exports.getStream = function() {
  var gitDir = env.TEXTREE_GIT_DIR;
  var gitRef = env.TEXTREE_GIT_REF || "master";
  if (!gitDir) {
    throw new Error("Variable TEXTREE_GIT_DIR is not set");
  }
};
