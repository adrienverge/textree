
var nodegit = require("nodegit");
var Q = require("kew");
var CatFile = require("./CatFile");
var Text2trees = require("./Text2trees");
var Trees2proc = require("./Trees2proc.js");
var Trees2xml = require("./Trees2xml");
var env = require("./env");
var TransformChain = require("./TransformChain");

/**
 * Responsible for producing the output for the given path
 */
exports.getStream = function(path, callback) {

  var catFile = new CatFile();
  var text2trees = new Text2trees();
  var proc = new Trees2proc();
  var deferred = Q.defer();
  var promise = deferred.promise;

  // var chain = new TransformChain([catFile, text2trees, proc]);
  // console.log("lalala2");
  // catFile.write({ path: "directory.textree" }, null, function() {
  //   console.log("on written", arguments);
  // });

  // var promise = env.getPath(path)
  //   .then(function(entry) {
  //     // .isFile(), .isTree()
  //     console.error("entry", entry.sha(), entry.path());
  //     return Q.nfcall(entry.getBlob.bind(entry));
  //   })
  //   .then(function(blob) {
  //     // console.error("blob", blob.content());
  //     var parser = new Text2trees();
  //     parser.end(blob.content());
  //     var output = new Trees2xml();
  //     output.getContentType = function() { return "text/plain;charset=utf8"; };


  //     return parser.pipe(new Trees2proc()).pipe(output);
  //     // return parser.pipe(output);

  //     // var trees2xml = new Trees2xml();
  //     // var output = trees2xml;
  //     // return output;
  //   });

  if (callback) {
    promise.then(function(value) { callback(null, value); }, callback);
  }

  return promise;

  // nodegit.Repo.open(gitDir, function(error, repos) {
  //   if (error) {
  //     callback(error);
  //   } else {
  //     console.error("repository opened successfully:", gitDir);

  //     repos.getBranch(gitRef, function(error, commit) {
  //       if (error) {
  //         callback(error);
  //       } else {
  //         console.error("branch", gitRef, "is commit", commit.sha());

  //         commit.getEntry(path, function(entry) {
  //           if (error) {
  //             callback(error);
  //           } else {
  //             callback();
  //           }
  //         });
  //       }
  //     });
  //   }
  // });

};
