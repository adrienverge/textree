
var Q = require("kew");
var nodegit = require("nodegit");
var mc = require("mc");

function makeChecks() {
  if (!process.env.TEXTREE_GIT_DIR) {
    throw new Error("Variable TEXTREE_GIT_DIR is not set");
  }
}


// exports.repository = null;
// exports.tree = null;
var gitRepository;
var gitCommit;
var gitDirPrefix = process.env.TEXTREE_ROOT_DIR ? process.env.TEXTREE_ROOT_DIR + "/" : "";


function loadGitTree() {

  var gitDir = process.env.TEXTREE_GIT_DIR;
  var gitRef = process.env.TEXTREE_GIT_REF || "master";

  if (!gitDir) {
    throw new Error("environment variable TEXTREE_GIT_DIR is not defined");
  }

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
  return Q.nfcall(gitCommit.getEntry.bind(gitCommit), gitDirPrefix + path);
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

// // https://github.com/3rd-Eden/node-memcached
// // PROBLEMS WITH BLOBS
// var memcached = new Memcached('localhost:11211', {
//   // the time after which Memcached sends a connection timeout (in milliseconds).
//   timeout: 1000,
//   //  the number of socket allocation retries per request.
//   retries: 2,
//   // the idle timeout for the connections.
//   idle: 30000,
//   // whether to use md5 as hashing scheme when keys exceed maxKeySize
//   keyCompression: false,
// });

var memcached = new mc.Client('127.0.0.1:11211');

// function logMemCacheDetails(name, details){
//   console.log("memcached:", name, ":", JSON.stringify(details, null, 4));
// };
// memcached.on('issue', logMemCacheDetails.bind(null, "issue"));
// memcached.on('failure', logMemCacheDetails.bind(null, "failure"));
// memcached.on('reconnecting', logMemCacheDetails.bind(null, "reconnecting"));
// memcached.on('reconnected', logMemCacheDetails.bind(null, "reconnected"));
// memcached.on('remove', logMemCacheDetails.bind(null, "remove"));

exports.setCachedContent = function(key, buffer) {
  // console.log("ENV setCachedContent", key, buffer.length);
  var count = 0;
  function doSet() {
    count++;
    memcached.set(key, buffer, {flags:0,exptime:0}, function(err, status) {
      if (err) {
        if (count <= 5 && err && err.type == "CONNECTION_ERROR") {
          console.error("memcached: client not connected. Connecting...");
          memcached.connect(function() {
            console.log("memcached: connected to server");
            doSet();
          });
        } else {
          console.error("ENV setCachedContent error saving", buffer.length, "bytes into memcached under key: "+key, ":", JSON.stringify(err));
        }
      } else {
        console.log("ENV setCachedContent saved", buffer.length, "bytes into memcached under key: "+key);
      }
    });
  }

  doSet();
};
