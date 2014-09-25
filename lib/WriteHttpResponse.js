
var stream = require('stream');
var util = require("util");
var env = require("./env");
var Q = require("kew");
// var buffer = require("buffer");

/**
 */
function WriteHttpResponse(response, options) {
  if (!options) { options = {}; }
  options.objectMode = true;
  stream.Transform.call(this, options);

  this.response = response;
  this.pipe(response);

  this.on("finish", function() {
    console.log("on finish http");
  });
  // this.on("finish", this.onEnd.bind(this));
}

util.inherits(WriteHttpResponse, stream.Transform);
module.exports = WriteHttpResponse;

WriteHttpResponse.prototype._transform = function(chunk, encoding, done) {
  // console.log("WriteHttpResponse: _write", chunk);
  if (typeof chunk == "string" || Buffer.isBuffer(chunk)) {
    console.log("HttpResponse: writing:", chunk);
    // this.response.write(chunk, encoding, done);
    this.push(chunk);
    done();
  } else {
    this.processEvent(chunk, done);
  }
};

// WriteHttpResponse.prototype.onEnd = function() {
//   console.log("HttpResponse END", arguments);
//   this.response.end();
// };

WriteHttpResponse.prototype.processEvent = function(event, done) {
  console.log("HttpResponse: event", event);
  done();
};


// /**
//  */
// function WriteHttpResponse(response, options) {
//   if (!options) { options = {}; }
//   options.objectMode = true;
//   stream.Writable.call(this, options);

//   this.response = response;

//   this.on("finish", function() {
//     console.log("on finish http");
//   });
//   // this.on("finish", this.onEnd.bind(this));
// }

// util.inherits(WriteHttpResponse, stream.Writable);
// module.exports = WriteHttpResponse;

// WriteHttpResponse.prototype._write = function(chunk, encoding, done) {
//   // console.log("WriteHttpResponse: _write", chunk);
//   if (typeof chunk == "string" || Buffer.isBuffer(chunk)) {
//     console.log("HttpResponse: writing:", chunk);
//     this.response.write(chunk, encoding, done);
//   } else {
//     this.processEvent(chunk, done);
//   }
// };

// WriteHttpResponse.prototype.onEnd = function() {
//   console.log("HttpResponse END", arguments);
//   this.response.end();
// };

// WriteHttpResponse.prototype.processEvent = function(event, done) {
//   console.log("HttpResponse: event", event);
//   done();
// };
