/**
 **
 **/

var stream = require('stream');
var util = require("util");
var TransformChain = require("./TransformChain");


function ReadableChain(chain, readableOptions) {
  if (!readableOptions) { readableOptions = {}; }
  readableOptions.objectMode = true;
  stream.Readable.call(this, readableOptions);

  this.chain = new TransformChain(chain);
  var lastStream = this.lastStream = chain[chain.length - 1];

  // Every time there's data, push it into the internal buffer.
  lastStream.on("data", function(chunk) {
    // if push() returns false, then stop reading from source
    if (!this.push(chunk)) {
      lastStream.pause();
    }
  }.bind(this));

  // // When the source ends, push the EOF-signaling `null` chunk
  // lastStream.onend = () => {
  //   this.push(null);
  // };
  lastStream.on("end", function() {
    this.push(null);
  }.bind(this));
}

util.inherits(ReadableChain, stream.Readable);
module.exports = ReadableChain;

ReadableChain.prototype._read = function(size) {
  this.lastStream.resume();
};
