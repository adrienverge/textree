/**
 ** Produce random suite of chars between given char codes
 **/

var stream = require('stream');
var util = require("util");


function MakeRandomChars(options) {
  if (!options) { options = {}; }
  stream.Readable.call(this, options);

  this.fromCode = this.from.charCodeAt(0);
  this.toCode = this.to.charCodeAt(0);
  this.counted = 0;
}

util.inherits(MakeRandomChars, stream.Readable);
module.exports = MakeRandomChars;

MakeRandomChars.prototype.from = "A";
MakeRandomChars.prototype.to = "Z";
MakeRandomChars.prototype.count = 4242;
// MakeRandomChars.prototype.count = Infinity;

MakeRandomChars.prototype._read = function(size) {
  // console.log("MakeRandomChars::_read", size);

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
