
var stream = require('stream');
var util = require("util");
var env = require("./env");
var Q = require("kew");

/**
 */
function CatFile(options) {
  if (!options) { options = {}; }
  options.objectMode = true;
  stream.Transform.call(this, options);

  this.fileStack = [];
}

util.inherits(CatFile, stream.Transform);
module.exports = CatFile;

CatFile.prototype._transform = function(event, encoding, done) {
  // console.log("CatFile::_transform", event);

  env.getPath(event.path)
    .then(function(entry) {
      // console.error("entry", entry.sha(), entry.path());
      return Q.nfcall(entry.getBlob.bind(entry));
    }.bind(this))
    .then(function(blob) {
      // console.log("--- BLOB START\n" + blob.toString()+"--- BOB END");
      this.push(blob.content());
      console.log("CatFile::_transform DONE");
      done();
    }.bind(this)).done();
};

CatFile.prototype._flush = function(done) {
  done();
};

// // a bit like write({ path: "..." })
// CatFile.prototype.pushFile = function(path) {
//   this.fileStack.push(path);
//   this.processStack();
// };

// CatFile.prototype.processStack = function() {
//   if (this.fileStack.length > 0) {
//     var path = this.fileStack.shift();
//   }
// };
