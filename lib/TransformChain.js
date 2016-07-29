
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

TransformChain.prototype.addPipe = function(readStream, writeStream, options) {
  // console.log("addPipe", readStream.constructor.name, writeStream.constructor.name);
  // {end:writeStream.inputPipeEnd === false ? false : true});
  // readStream.addPipe(writeStream, {end:writeStream.inputPipeEnd === false ? false : true});
  if (!options) { options = {}; }
  // if (writeStream.inputPipeEnd != true) {
  var isInsertedReadable = !readStream.write && this.streams.indexOf(readStream) > 0;
  options.end = /*writeStream.inputPipeEnd !== false &&*/ !isInsertedReadable;
  // }
  // if (!("end" in options)) { options.end = !writeStream.inputPipeEnd; }
  // var defer = Q.defer();

  if (writeStream.write) {
    readStream.pipe(writeStream, options);
    // writeStream.once("unpipe", function(src) {
    //   // console.log("UNPIPE: "+src.constructor.name+" -> "+writeStream.constructor.name);
    // });
  }
  // readStream.once("end", function() {
  //   console.log("ENDED: "+readStream.constructor.name, readStream._readableState.ended, readStream._readableState.ending);
  //   if (readStream.constructor.name == "Text2trees") {
  //     // throw new Error("what??");
  //   }
  //   this.cleanEnded(readStream);
  //   defer.resolve();
  // }.bind(this));
  // console.log("..TransformChain#addPipe(): "+readStream.constructor.name+" > "+writeStream.constructor.name);

  // return defer.promise;
};

TransformChain.prototype.dropPipe = function(readable, writable) {
  readable.unpipe(writable);
  // if (writable.emptyInputBuffer) {
  //   var events = writable.emptyInputBuffer();

  //   while (events.length > 0) {
  //     readable.unshift(events.pop());
  //   }
  // }
};

/**
 * Insert temporary chain readableChain before writableStream and cut it at 'end'
 *
 * @param {WritableInterface} writableStream
 * @param {Array.<Transform>} readableChain
 * @return {Promise}  Will be resolved once the last stream amits en 'end' event
 */
// TransformChain.prototype.unshiftReadables = function(writableStream, readableChain) {

//   var writableIdx = this.streams.indexOf(writableStream);
//   if (writableIdx < 0) {
//     throw new Error("unshiftReadables(): writable stream does not belong to the chain");
//   }
//   if (writableIdx > 0) {
//     // break the chain where we have to insert the new sub-chain
//     var inputStream = this.streams[writableIdx - 1];
//     console.log("unshiftReadables(): breaking: "+inputStream.constructor.name+" > "+writableStream.constructor.name);
//     this.dropPipe(inputStream, writableStream);
//   }
//   // console.log("unshiftReadables(): setting up readableChain...");
//   // setup pipes in readableChain + upstream inputStream
//   var lastStream = readableChain.reduce(function(prev, item) {
//     this.setupStream(item);
//     // console.log("stream: "+item.constructor.name);
//     if (prev) {
//       // kind of "private" pipe: 'end' event does not trigger reconnecting the chain
//       // (only the last item, with this.addPipe() below)
//       // prev.addPipe(item);
//       this.addPipe(prev, item);
//     }
//     return item;
//   }.bind(this), inputStream);

//   this.streams.splice.apply(this.streams, [writableIdx, 0].concat(readableChain));

//   // console.log("unshiftReadables(): adding output pipe");

//   // connect output between inputStream and writableStream
//   // cleanEnded() will be called at 'end' event and the readableChain will be cut.
//   return this.addPipe(lastStream, writableStream, {end: false});

//   // lastStream.addPipe(writableStream, { end: false });
//   // lastStream.once("end", this.cleanEnded.bind(this, lastStream));
// };

TransformChain.prototype.setupStream = function(stream) {
  // console.log("setup stream", stream.constructor.name);
  stream.transformChain = this;
  stream.once("end", function() {
    // console.log("ENDED: "+stream.constructor.name, stream._readableState.ended, stream._readableState.ending);
    if (stream.constructor.name == "Text2trees") {
      // throw new Error("what??");
    }
    this.cleanEnded(stream);
  }.bind(this));
  // stream.once("end", this.cleanEnded.bind(this, stream));
};

TransformChain.prototype.cleanEnded = function(stream) {
  var streamIdx = this.streams.indexOf(stream);
  // console.log("..TransformChain#cleanEnded(): "+stream.constructor.name+"["+streamIdx+"]");
  var nextStream = this.streams[streamIdx + 1];
  if (streamIdx >= 0) {
    for (var idx = streamIdx; idx >= 0; idx--) {
      if (!this.streams[idx]._readableState.ended) {
        // this.debugPrintChain("cleanEnded BEFORE");
        this.reconnect(idx, streamIdx+1);
        // this.debugPrintChain("cleanEnded AFTER");
        return;
      }
    }
    // all is ended: we need to cut off the whole and end next stream
    // console.log("..TransformChain#cleanEnded() LEFT ENDED");
    if (nextStream) {
      this.dropPipe(stream, nextStream);
      // streamIdx = this.streams.indexOf(stream);
      // this.streams.splice(0, streamIdx + 1);
      if (nextStream != process.stdout) {
        if (nextStream.onInputEnd) {
          // console.log("..TransformChain#cleanEnded() onInputEnd", nextStream.constructor.name);
          nextStream.onInputEnd();
        } else {
          // console.log("..TransformChain#cleanEnded() ENDING", nextStream.constructor.name);
          // nextStream.propagateRight();
          nextStream.end();
        }
      }
    }
    // console.log("the whole chain (left) is ended! (should propagate 'end' to the rest...)");
    // } else if (streamIdx == 0) {
    //     console.log("First stream has ENDED");
  } else {
    var msg ="cleanEnded("+stream.constructor.name+"): ref stream does not belong to the chain";
    this.debugPrintChain(msg);
    // throw new Error(msg);
  }
  // this.debugPrintChain("cleanEnded");
  // console.log(this.streams[1]);
};

TransformChain.prototype.reconnect = function(idx1, idx2) {
  // console.log("..RECONNECT "+idx1+" TO "+idx2+ " (splicing "+(idx2 - idx1 - 1)+" items)");

  if (idx1 >= 0) {
    this.dropPipe(this.streams[idx1], this.streams[idx1+1]);
  }
  if (idx2 < this.streams.length) {
    this.dropPipe(this.streams[idx2 - 1], idx2);
    if (idx1 >= 0) {
      this.addPipe(this.streams[idx1], this.streams[idx2]);
    }
  }
  this.streams.splice(idx1 + 1, idx2 - idx1 - 1);
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
      this.dropPipe(precStream, stream);
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
      this.dropPipe(stream, precStream);
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
TransformChain.prototype.drop = function(stream) {
  var idx = this.streams.indexOf(stream);
  if (idx < 0) {
    throw new Error("drop(): ref stream does not belong to the chain");
  }
  this.reconnect(idx - 1, idx + 1);
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
              .map(function(stream) {
                var name = stream && stream.constructor.name;
                if (stream._writableState) {
                  if (stream._writableState.ended) { name += "!"; }
                  if (stream._writableState.ending) { name += ".."; }

                  // name = "("+stream._writableState.pipesCount+")"+name;
                }
                if (stream._readableState) {
                  name = "("+stream._readableState.pipesCount+")"+name;
                  if (stream._readableState.ended) { name = "!" + name; }
                }
                return name;
              })
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
