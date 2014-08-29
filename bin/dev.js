#!/usr/bin/env nodejs

// http://thanpol.as/javascript/promises-a-performance-hits-you-should-be-aware-of/

var textree = require("../lib/textree");
// var Q = require("q");

var path = "first.textree";

// for (var i = 0; i < 5000; i++) {
var env = require("../lib/env");
env.init().then(function() {

  return textree.getStream(path).then(function(stream) {
    // stream.on("readable", function(aa) {
    //   var data = stream.read();
    //   console.error("INREAD", data);
    // });
    stream.pipe(process.stdout);

  });

}).done();

// textree.getStream(path, function(error, stream) {
//   console.log("got stream", stream);
//   stream.pipe(process.stdout);
// });
// }
