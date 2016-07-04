
var Q = require("kew");

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
    this.setupStream(this.streams[i]);
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
  // readStream.pipe(writeStream, {end:writeStream.inputPipeEnd === false ? false : true});
  var defer = Q.defer();

  readStream.pipe(writeStream, {end: !readStream.endByItself});
  readStream.once("end", function() {
    this.cleanEnded(readStream);
    defer.resolve();
  }.bind(this));
  console.log("..TransformChain#addPipe(): "+readStream.constructor.name+" > "+writeStream.constructor.name);

  return defer.promise;
};

/**
 * Insert temporary chain readableChain before writableStream and cut it at 'end'
 *
 * @param {WritableInterface} writableStream
 * @param {Array.<Transform>} readableChain
 * @return {Promise}  Will be resolved once the last stream amits en 'end' event
 */
TransformChain.prototype.unshiftReadables = function(writableStream, readableChain) {

  var writableIdx = this.streams.indexOf(writableStream);
  if (writableIdx < 0) {
    throw new Error("unshiftReadables(): writable stream does not belong to the chain");
  }
  if (writableIdx > 0) {
    // break the chain where we have to insert the new sub-chain
    var inputStream = this.streams[writableIdx - 1];
    console.log("unshiftReadables(): inputStream is: "+inputStream.constructor.name);
    inputStream.unpipe(writableIdx);
  }
  console.log("unshiftReadables(): setting up readableChain...");
  // setup pipes in readableChain + upstream inputStream
  var lastStream = readableChain.reduce(function(prev, item) {
    this.setupStream(item);
    console.log("stream: "+item.constructor.name);
    if (prev) {
      // prev.pipe(item);
      this.addPipe(prev, item);
    }
    return item;
  }.bind(this), inputStream);

  this.streams.splice.apply(this.streams, [writableIdx, 0].concat(readableChain));

  console.log("unshiftReadables(): adding output pipe");

  // connect output between inputStream and writableStream
  // cleanEnded() will be called at 'end' event and the readableChain will be cut.
  return this.addPipe(lastStream, writableStream);

  // lastStream.pipe(writableStream, { end: false });
  // lastStream.once("end", this.cleanEnded.bind(this, lastStream));
};

TransformChain.prototype.setupStream = function(stream) {
  stream.transformChain = this;
  // stream.once("end", this.cleanEnded.bind(this, stream));
};

TransformChain.prototype.cleanEnded = function(stream) {
  console.log("..TransformChain#cleanEnded(): "+stream.constructor.name);
  var streamIdx = this.streams.indexOf(stream);
  var nextStream = this.streams(streamIdx + 1);
  if (streamIdx < 0) {
    throw new Error("cleanEnded("+stream.constructor.name+"): ref stream does not belong to the chain");
  }
  for (var idx = streamIdx; idx >= 0; idx--) {
    if (!this.streams[idx]._readableState.ended) {
      console.log("cleanEnded(): reconnecting idx "+idx+" with idx"+(streamIdx+1));
      this.streams[idx].unpipe(this.streams[idx+1]);
      this.streams[streamIdx].unpipe(nextStream);
      this.streams[idx].pipe(nextStream);
      return;
    }
  }
  console.log("the whole chain (left) is ended! (should propagate 'end' to the rest...)");
};

TransformChain.prototype.getSide = function(side, stream) {
  var streams = this.streams;
  var idx = streams.indexOf(stream);
  if (idx < 0) {
    throw new Error("connectSide('"+side+"', "+stream.constructor.name+"): ref stream does not belong to the chain: ");
  }
  if (side == "<") {
    return idx > 0 ? streams[idx - 1] : null;
  } else {
    return idx < streams.length - 1 ? streams[idx + 1] : null;
  }
};

// TransformChain.prototype.getSideChain = function(side, stream) {
//   var streams = this.streams;
//   var idx = streams.indexOf(stream);
//   if (idx < 0) {
//     throw new Error("connectSide(): ref stream does not belong to the chain");
//   }
//   return side == "<" ? streams.slice(0, idx) : streams.slice(idx + 1);
// };

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
      this.setupStream(streamToConnect);
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
      this.setupStream(streamToConnect);
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

TransformChain.prototype.getStreamIndex = function(stream) {
  var idx = this.streams.indexOf(stream);
  if (idx < 0) {
    throw new Error("ref stream does not belong to the chain: "+stream);
  }
  return idx;
};

TransformChain.prototype.debugPrintChain = function(msg) {
  console.log(this.constructor.name+"["+(msg || "this")+"]: "+
              this.streams
              .map(function(stream) { return stream && stream.constructor.name; })
              .join(' > '));

};

/**
 * @param {Stream} stream
 * @param {number} count        number of neighboords to drop
 *                              (positive = right neighboords,
 *                               negative = left neighboords,
 *                               0 (or null or undefined) = drop 'stream' only)
 */
// TransformChain.prototype.drop = function(stream, count) {
//   var idx = this.getStreamIndex(stream);
//   var precStream = count ? stream : this.streams[idx - 1 + Math.min(0, count)];
//   var nextStream = this.streams[idx + Math.max(0, count)];
// };

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
