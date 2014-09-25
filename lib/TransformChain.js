
/**
 * Chain of Transform objects, piped to one another
 *
 * Provide functions to manipulate the chain (break and connect)
 *
 * This is because stream.Writable has no control over what is connected
 * to its input.
 */
function TransformChain(chain)
{
  this.streams = chain ? chain.slice(0) : [];
  var lastStream;
  for (var i = 0; i < this.streams.length; i++) {
    this.streams[i].transformChain = this;
    if (lastStream) {
      this.addPipe(lastStream, this.streams[i]);
    }
    lastStream = this.streams[i];
  }
}

module.exports = TransformChain;

TransformChain.prototype.addPipe = function(readStream, writeStream) {
  // console.log("addPipe", readStream.constructor.name, writeStream.constructor.name,
  // {end:writeStream.inputPipeEnd === false ? false : true});
  readStream.pipe(writeStream, {end:writeStream.inputPipeEnd === false ? false : true});
};

/**
 *
 * // 'null' means "end point"
 *
 * chain.update([null, r1, t1, t2, null])  // update the whole chain
 * chain.update([t1, t2]) // if t1 present, insert t2 as a post-filter
 * chain.update([t1, t2]) // if t2 present, insert t1 as a pre-filter
 *   // error if t1 and t2 are both present: it may be ambiguous
 *   // error none of t1 and t2 are present: missing anchor
 * chain.update([t1, t2, null]) // if t1 present, replace t2 as its output
 */
TransformChain.prototype.update = function(chain) {
};

TransformChain.prototype.getSide = function(side, stream) {
  var streams = this.streams;
  var idx = streams.indexOf(stream);
  if (idx < 0) {
    throw new Error("connectSide(): ref stream does not belong to the chain");
  }
  if (side == "<") {
    return idx > 0 ? streams[idx - 1] : null;
  } else {
    return idx < streams.length - 1 ? streams[idx + 1] : null;
  }
};

TransformChain.prototype.getSideChain = function(side, stream) {
  var streams = this.streams;
  var idx = streams.indexOf(stream);
  if (idx < 0) {
    throw new Error("connectSide(): ref stream does not belong to the chain");
  }
  return side == "<" ? streams.slice(0, idx) : streams.slice(idx + 1);
};

/**
 * @param {string} side  one of: "<" (input), ">" (output)
 * @param {Stream} stream  reference stream (must be present in the chain)
 * @param {Stream} streamToConnect  stream to insert or null to break the chain
 */
TransformChain.prototype.connectSide = function(side, stream, streamToConnect) {
  // console.log("connectSide", side, stream.toString(), streamToConnect && streamToConnect.toString());
  var idx = this.streams.indexOf(stream);
  // console.log("idx", idx, this.streams.map(function(m) { return m && m.toString(); }));
  var precStream;
  if (idx < 0) {
    throw new Error("connectSide(): ref stream does not belong to the chain");
  }
  if (side === "<") {
    // INPUT
    if (idx > 0) {
      precStream = this.streams[idx - 1];
      precStream.unpipe(stream);
    }
    if (streamToConnect) {
      streamToConnect.transformChain = this;
      this.streams.splice(idx, 0, streamToConnect);
      this.addPipe(streamToConnect, stream);
      if (precStream) {
        this.addPipe(precStream, streamToConnect);
      }
    } else {
      this.streams.splice(0, idx);
    }
  } else {
    // OUTPUT
    precStream = this.streams[idx + 1];
    if (precStream) {
      stream.unpipe(precStream);
    }
    if (streamToConnect) {
      streamToConnect.transformChain = this;
      this.streams.splice(idx + 1, 0, streamToConnect);
      this.addPipe(stream, streamToConnect);
      if (precStream) {
        this.addPipe(streamToConnect, precStream);
      }
    } else {
      this.streams.splice(idx + 1, Infinity);
    }
  }
};

/**
 *
 *
 * @param {string} side One of "<" (input) or ">" (output)
 * @param {Stream} stream Must be Readable if side==">", Writable if side=="<"
 * @param {Array.<Stream>} chain which may end with a null item
 */
TransformChain.prototype.___connectSideChain = function(side, stream, chain) {
  if (!chain.length) {
    return; // nothing to do
  }

  // [null
  //
  // chain[0] === null
};

// TransformChain.prototype.connectInput = function(writable, readableToConnect)
// TransformChain.prototype.connectOutput = function(readable, writableToConnect)
// TransformChain.prototype.disconnectInput = function(writable)
// TransformChain.prototype.disconnectOutputput = function(writable)
