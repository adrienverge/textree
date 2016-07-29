/**
 ** Produce random suite of chars between given char codes
 **/

var stream = require('stream');
var util = require("util");

/**
 * Only generate random chars between this.from and this.to
 *
 * To be generalized to different methods of char generations
 * (token repetition...)
 */
function GenerateChars(options) {
  if (!options) { options = {}; }
  stream.Readable.call(this, options);

  this.fromCode = this.from.charCodeAt(0);
  this.toCode = this.to.charCodeAt(0);
  this.counted = 0;
}

util.inherits(GenerateChars, stream.Readable);
module.exports = GenerateChars;

GenerateChars.prototype.from = "A";
GenerateChars.prototype.to = "Z";
GenerateChars.prototype.count = 4242;
// GenerateChars.prototype.count = Infinity;

GenerateChars.prototype._read = function(size) {
  // console.log("GenerateChars::_read", size);

  var chars = "";
  for (var i = 0; i < size; i++) {
    if (this.counted >= this.count) {
      break;
    }

    chars += String.fromCharCode(randomIntInc(this.fromCode, this.toCode));

    this.counted++;

  }
  if (chars.length > 0) {
    this.push(chars);
  }
  if (this.counted >= this.count) {
    this.push(null);
  }
};

// https://blog.tompawlak.org/generate-random-values-nodejs-javascript
function randomIntInc (low, high) {
    return Math.floor(Math.random() * (high - low + 1) + low);
}
