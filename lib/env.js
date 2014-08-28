
var Q = require("kew");
var nodegit = require("nodegit");

function makeChecks() {
  if (!process.env.TEXTREE_GIT_DIR) {
    throw new Error("Variable TEXTREE_GIT_DIR is not set");
  }
}


// exports.repository = null;
// exports.tree = null;
var gitRepository;
var gitCommit;

function loadGitTree() {

  var gitDir = process.env.TEXTREE_GIT_DIR;
  var gitRef = process.env.TEXTREE_GIT_REF || "master";

  return Q.nfcall(nodegit.Repo.open, gitDir)
    .then(function(repos) {
      console.error("Loaded GIT repository:", gitDir);
      gitRepository = repos;
      return Q.nfcall(repos.getBranch.bind(repos), gitRef);
    })
    .then(function(commit) {
      console.error("Loaded GIT branch", gitRef, ":", commit.sha());
      gitCommit = commit;
      // return commit.getEntry(path);
    });

};

// must not begin with a slash '/'
exports.getPath = function(path) {
  return Q.nfcall(gitCommit.getEntry.bind(gitCommit), path);
};

exports.init = function() {
  return loadGitTree();
};

exports.refresh = function() {
  gitRepository = null;
  gitCommit = null;

  return loadGitTree();
};

exports.httpPort = process.env.TEXTREE_HTTP_PORT || 8080;
