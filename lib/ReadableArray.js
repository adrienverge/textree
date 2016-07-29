
var stream = require('stream');
var util = require("util");

function ReadableArray(array, options) {
  if (!options) { options = {}; }
  options.objectMode = true;
  stream.Readable.call(this, options);

  this.array = array;
  this.index = 0;
}

util.inherits(ReadableArray, stream.Readable);
module.exports = ReadableArray;

ReadableArray.prototype._read = function(size) {
  // console.log("ReadableArray::_read", size);

  for (var i = 0; i < size; i++) {

    if (this.index >= this.array.length) {
      this.push(null);
    } else {

      if (!this.push(this.array[this.index++])) {
        break;
      }
    }

  }
};
