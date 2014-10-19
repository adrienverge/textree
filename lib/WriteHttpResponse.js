
var stream = require('stream');
var util = require("util");
var env = require("./env");
var Q = require("kew");
// var buffer = require("buffer");

// MAX_CACHABLE_SIZE must not exceed memcached options.maxValue (defined in ./env.js)
var MAX_CACHABLE_SIZE = 512 * 1024;

/**
 * Textree transform: between textree serializer and HTTP response
 *
 * content flow: string/Buffer chunks
 * control flow: event objects
 *
 * In addition, output is cached until MAX_CACHABLE_SIZE bytes
 * for saving into the memcached server.
 *
 */
function WriteHttpResponse(response, options) {
  if (!options) { options = {}; }
  options.objectMode = true;
  stream.Transform.call(this, options);
  if (options.contentCacheKey) {
    if (options.contentCacheKey.length < 250) {
      console.log("HttpResponse: enabling cache with contentCacheKey=", options.contentCacheKey);
      this.contentCacheKey = options.contentCacheKey;
      this.ouputCacheBuffer = new Buffer(MAX_CACHABLE_SIZE);
      this.ouputCacheBufferUsed = 0;
    } else {
      console.log("WriteHttpResponse: disabled cache as key exceeds the 250 bytes limit:",
                  options.contentCacheKey);
    }
  }
  this.response = response;
  this.pipe(response);

  this.on("finish", function() {
    console.log("on finish http");
    if (this.ouputCacheBuffer) {
      var slicedBuffer = this.ouputCacheBuffer.slice(0, this.ouputCacheBufferUsed);
      console.log("this.contentCacheKey =", this.contentCacheKey,
                  "this.ouputCacheBuffer =", typeof this.ouputCacheBuffer,
                  "length =", this.ouputCacheBuffer.length,
                  "used bytes", this.ouputCacheBufferUsed,
                  "sliced =", slicedBuffer.length);
      env.setCachedContent(this.contentCacheKey, slicedBuffer);
    }

  });
  // this.on("finish", this.onEnd.bind(this));
}

util.inherits(WriteHttpResponse, stream.Transform);
module.exports = WriteHttpResponse;

WriteHttpResponse.prototype._transform = function(chunk, encoding, done) {
  // console.log("WriteHttpResponse: _write", chunk);
  if (typeof chunk == "string" || Buffer.isBuffer(chunk)) {
    console.log("HttpResponse: writing:", Buffer.isBuffer(chunk) ? "(buffer)" : "(string)", "size="+chunk.length, chunk);
    // this.response.write(chunk, encoding, done);
    // MAX_CACHABLE_SIZE
    if (this.ouputCacheBuffer) {
      var chunkSize = typeof chunk == "string" ? Buffer.byteLength(chunk) : chunk.length;
      if (this.ouputCacheBufferUsed + chunkSize < MAX_CACHABLE_SIZE) {
        if (typeof chunk == "string") {
          this.ouputCacheBuffer.write(chunk, this.ouputCacheBufferUsed); // string version
        } else {
          chunk.copy(this.ouputCacheBuffer, this.ouputCacheBufferUsed); // Buffer version
        }
        this.ouputCacheBufferUsed += chunkSize;
      } else {
        console.log("Content exceeds MAX_CACHABLE_SIZE (=", MAX_CACHABLE_SIZE, "), not cached");
        this.ouputCacheBuffer = null;
      }
    }
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
  // console.log("HttpResponse: event", event);
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
