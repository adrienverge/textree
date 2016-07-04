
var stream = require('stream');
var util = require("util");

function SmartTransform(options)
{
  if (!options) { options = {}; }
  options.objectMode = true;
  stream.Transform.call(this, options);

  this.endByItself = options.endByItself;
}

util.inherits(SmartTransform, stream.Transform);
module.exports = SmartTransform;

SmartTransform.prototype.unshiftIn = function(event)
{
  // console.log("..unshiftIn() this="+this.constructor.name);
  var input = this.transformChain.getSide("<", this);
  if (!this._readableState.objectMode) {
    console.log("Warning: unshiftIn(): input is not in objectMode: "+input.constructor.name);
  }
  this.transformChain.debugPrintChain();
  console.log("..unshifting back from "+this.constructor.name+" to "+input.constructor.name+": ", event);
  input.unshift(event);
  // this.endLevel();
};
