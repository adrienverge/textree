
var stream = require('stream');
var util = require("util");

/**
 * Useless at the moment
 */
function Transform(options)
{
  if (!options) { options = {}; }
  options.objectMode = true;
  stream.Transform.call(this, options);
}

util.inherits(Transform, stream.Transform);
module.exports = Transform;

// SmartTransform.prototype.unshiftEnd = function(event)
// {
//   // console.log("..unshiftIn() this="+this.constructor.name);
//   var input = this.transformChain.getSide("<", this);
//   if (!this._readableState.objectMode) {
//     console.log("Warning: unshiftIn(): input is not in objectMode: "+input.constructor.name);
//   }
//   // this.once("finish", function() {
//   // }.bind(this));
//   input.unpipe(this);
//   this.end();
//   // this.transformChain.debugPrintChain(this.constructor.name+".unshiftEnd");
//   if (event) {
//     // console.log("..unshifting back from "+this.constructor.name+" to "+input.constructor.name+": ", event);
//     input.unshift(event);
//   }
// };
