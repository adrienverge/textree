#!/usr/bin/env nodejs
//
// export TEXTREE_GIT_DIR=/local.repository.git/
//

// http://thanpol.as/javascript/promises-a-performance-hits-you-should-be-aware-of/

var textree = require("../lib/textree");
// var Q = require("q");
// var CatFile = require("./CatFile");
// var Text2trees = require("./Text2trees");
var Trees2proc = require("../lib/Trees2proc.js");
// var Trees2xml = require("./Trees2xml");
var TransformChain = require("../lib/TransformChain");
var stream = require('stream');
var util = require("util");

// for (var i = 0; i < 5000; i++) {

function ConsoleFilter(response, options) {
  if (!options) { options = {}; }
  options.objectMode = true;
  stream.Transform.call(this, options);

  this.response = response;

  // this.on("finish", this._onEnd.bind(this));
}

util.inherits(ConsoleFilter, stream.Transform);
module.exports = ConsoleFilter;

ConsoleFilter.prototype._transform = function(chunk, encoding, done) {
  if (typeof chunk == "string" || Buffer.isBuffer(chunk)) {
    this.push(chunk);
  } else {
    // console.log("ConsoleFilter: event", chunk);
  }
  done();
};


// var path = "first.textree";
var path = process.argv[2] || "";

var env = require("../lib/env");
env.init().then(function() {

  var proc = new Trees2proc({globalContext: {
      REQUEST: {
        path: path,
        query: "",
        headers: {}
      }
  }});
  var chain = new TransformChain([proc, new ConsoleFilter(), process.stdout]);

  // proc.sourceFile(path);

  proc.loadPath(path).then(function() {
    // console.log("path loaded");
    proc.sourceFile("directory.textree");
  }).done();


  // return textree.getStream(path).then(function(stream) {
  //   // stream.on("readable", function(aa) {
  //   //   var data = stream.read();
  //   //   console.error("INREAD", data);
  //   // });
  //   stream.pipe(process.stdout);
  // });

}).done();

// textree.getStream(path, function(error, stream) {
//   console.log("got stream", stream);
//   stream.pipe(process.stdout);
// });
// }
