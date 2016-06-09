
var stream = require('stream');
var util = require("util");
var SmartTransform = require("./SmartTransform");
var events = require("events");
var Q = require("kew");
var vm = require("vm");
var CatFile = require("./CatFile");
var Text2trees = require("./Text2trees");
var Trees2xml = require("./Trees2xml");
var env = require("./env");
var pathUtils = require("path");

////////////////////////////////////////////////////////////////////////////////

/**
 * Provide Readable interface to read arrayBuffer
 */
function ArrayPrependStream(arrayBuffer, options) {
  console.log("******* got array buffer", arrayBuffer);
  if (!options) { options = {}; }
  options.endByItself = true;
  // stream.Readable.call(this, options);
  SmartTransform.call(this, options);

  this.arrayBuffer = arrayBuffer;
  this.index = 0;
  this.defer = Q.defer();
  this.atEnd = this.defer.promise;


}
util.inherits(ArrayPrependStream, SmartTransform);
// util.inherits(ArrayPrependStream, stream.Readable);

ArrayPrependStream.prototype.progress = function () {
  if (this.index < this.arrayBuffer.length) {

    var ready = true;
    while (ready && this.index < this.arrayBuffer.length) {
      ready = this.push(this.arrayBuffer[this.index]);
      this.index++;
    }
    if (this.index == this.arrayBuffer.length) {
      this.defer.resolve();
    }
  }

  return this.atEnd;
};

ArrayPrependStream.prototype._transform = function (event, encoding, done) {
  this.progress.then(function() {
    this.push(event);
    done();
  }.bind(this));

  // var ready = true;
  // while (ready && this.index < this.arrayBuffer.length) {
  //   ready = this.push(this.arrayBuffer[this.index]);
  //   this.index++;
  // }
  // if (this.index == this.arrayBuffer.length) {
  //   this.arrayBuffer = null;
  //   // this.transformChain.dropUnit(this);
  // }
};
ArrayPrependStream.prototype._flush = function (done) {
  this.progress.flush();
};

////////////////////////////////////////////////////////////////////////////////

/**
 * Pass IN to OUT until an END event does not match a START event
 *
 * Event "end" is sent for the Readable interface when
 * the extra {type:"end"} event is met.
 * That event is unshifted back to IN.
 */
function EndWithLevelStream(options) {
  if (!options) { options = {}; }
  options.endByItself = true;
  SmartTransform.call(this, options);

  this.depth = 0;
  this.defer = Q.defer();
  this.atEnd = this.defer.promise;
}
util.inherits(EndWithLevelStream, SmartTransform);

EndWithLevelStream.prototype._transform = function(event, encoding, done) {
  switch (event && event.type) {
  case "start":
    this.depth++;
  case "end":
    this.depth--;
    if (this.depth < 0) {
      this.unshiftIn(event);
      this.endLevel();
      done();
      return;
    }
  }
  this.push(event);
  done();
};
EndWithLevelStream.prototype.endLevel = function() {
  this.end();
  this.defer.resolve();
};

////////////////////////////////////////////////////////////////////////////////

/**
 * Write events to object property as array
 */
function ToVariableWritable(obj, property, options) {
  if (!options) { options = {}; }
  options.objectMode = true;
  SmartTransform.call(this, options);

  this.obj = obj;
  this.property = property;
  this.obj[this.property] = [];
}
util.inherits(ToVariableWritable, SmartTransform);

ToVariableWritable.prototype._write = function(chunk, encoding, callback) {
  this.obj[this.property].push(chunk);
  callback();
};



////////////////////////////////////////////////////////////////////////////////

function Trees2proc(options) {
  if (!options) { options = {}; }
  options.objectMode = true;
  SmartTransform.call(this, options);

  // queue of events to process (starting with [0])
  this.eventQueue = [];

  // execution stack (current is [index - 1])
  this.contextStack = [this.executeDefault];

  // input-level (start/stop) state stack (current is [0])
  // initialized with root level
  if (options.levelState) {
    this.levelState = options.levelState.slice(0);
  } else {
    this.levelState = [{selectors: {}}];
  }

  // NodeJS VM context of JS expr evaluations
  this.vmContext = vm.createContext(options.globalContext || {}, {});

  // // Stack of variable values that shall get restored.
  // // [0] is supposed to be in the environment
  // this.vmMaskStack = [];

  // [0] is the negative address if the latest continuation break (":on")
  // For example, 42 means the continuation is at eventQueue[eventQueue.index - 42].
  // Unshifted and shifted by ":on", shifted also by ":through"
  this.continuationPositions = [];

  // this.on("finish", function() {
  //   console.log("on finish", new Error("lala"));
  //   throw new Error("....");
  // });
}

util.inherits(Trees2proc, SmartTransform);
module.exports = Trees2proc;

// Trees2proc.prototype.end = function() {
// };

// Trees2proc.prototype.inputPipeEnd = false;

Trees2proc.prototype.cloneStream = function () {
  console.log("cloneStream", typeof this.constructor);

  var clone = new (this.constructor)({ levelState: this.levelState });

  return clone;
};

////////////////////////////////////////////////////////////////////////////////
// COMMAND FUNCTIONS

Trees2proc.prototype.executeDefault = function (event) {
  var selectors = [];

  // console.log("executeDefault", event);
  switch (event.type) {

  case "start":
    this.unshiftLevel(event);
    if (event.name[0] == ":") {
      var expr = event.name.slice(1);
      if (/^[<>]/.test(expr[0])) {
        return this.op_chain(event);
      }
      var fname = "command_"+expr.replace(/-/g, "_");
      if (event.name == "::") {
        fname = "command_on";
      }
      if (this[fname]) {
        return this[fname].call(this, event);
      } else {
        console.error("command not found:", event.name);
      }
    } else if ( /=$/.test(event.name)) {
      return this.op_affect(event);
    }

    // if (selectors[event.name] && selectors[event.name].length > 0) {
    //   return selectors[event.name][0].call(this, event);
    // }
    selectors.push(event.name, "*");
    this.lastStart = event;
    break;

  case "end":
    if (this.shiftLevel(event) === false) {
      return null;
    }
    selectors.push("END");
    break;

  case "text": selectors.push("TEXT"); break;
  case "attr": selectors.push("@"+event.name, "@*"); break;
    // case "id": selectors.push("@id", "@*"); break;
    // case "class": selectors.push("@class", "@*"); break;
  }

  // check selectors
  // console.log("checking", selectors);
  var handler, levelStates = this.levelState;
  // var registered = this.levelState[0].selectors;
  for (var level = 0; level < levelStates.length; level++) {
    // registered = levelStates[level].selectors
    for (var idx = 0; idx < selectors.length; idx++) {
      if ((handler = levelStates[level].selectors[selectors[idx]])) {
        return handler.call(this, event);
      }
    }
  }

  this.push(event);
  return null;
};

/**
 * DISABLED as it is difficult to handle
 * (the START event has been processed already)
 *
 * @param {object} textEvent
 */
// Trees2proc.prototype.op_set = function (textEvent) {
//   this.evalExpression(this.lastStart.name+textEvent.text);
//   this.captureLevelEvents(true).done();
// };

// /**
//  * element= expression // expression is inserted as first child/children
//  * Can be fed with a javascript or
//  */
// Trees2proc.prototype.op_affect = function (event) {
//   this.captureTextAndEval().then(function(value) {
//     if (value instanceof Error) {
//       value = "[JS expression error: "+value+"]";
//     }
//     var pure = event.name == "=";
//     if (!pure) {
//       this.push({ type: event.type, name: event.name.replace(/=$/, "") });
//     }
//     // console.log("value", typeof value, value);
//     if (typeof value == "object") {
//       this.push(value);
//     } else {
//       this.push({ type: "text", text: ""+value });
//     }
//     if (pure) {
//       return this.captureLevelEvents(true);
//     }
//     return null;
//   }.bind(this)).done();
// };

// /**
//  * Example:
//  *   :eval variable = expression
//  */
// Trees2proc.prototype.command_eval = function (event) {
//   this.captureFirstText()
//     .then(this.evalExpression.bind(this))
//     .then(this.captureLevelEvents.bind(this, true))
//     .done();
// };

// /**
//  * Example:
//  *   :var variable = expression
//  *   :var variable
//  */
// Trees2proc.prototype.command_var = function (event) {
//   this.captureFirstText()
//     .then(function(text) {
//       var parts = text.split("=");
//       var variable = parts[0];
//       var expr = parts[1] || "null";
//       this.evalExpression(variable+"="+expr);
//     }.bind(this))
//     .then(this.captureLevelEvents.bind(this, true))
//     .done();
// };

Trees2proc.prototype.command_if = function (event) {
  // this.levelState
  this.captureTextAndEval().then(function(value) {
    // console.log("if:value:", value, !!value);
    if (value instanceof Error) {
      this.push(event);
      this.push({ type: "text", text: "[JS expression error: "+value+"]" });
      return null;
    }
    if (!!value) {
      this.levelState[0].onEnd = function(event) { return false; };
      return null;
    } else {
      return this.captureLevelEvents(true);
    }
  }.bind(this)).done();
};

Trees2proc.prototype.command_each = function (event) {

  var bindName;
  var bindKey;
  var arrayExpr;
  // var arrayLength;

  // TODO: eval expression once only

  var array;

  this.captureFirstText()

    .then(function(text) {

      var parts = text.split(" in ");
      if (parts.length < 2) {
        console.log(":each bad syntax argument:", text);
        this.push(event);
        this.push({ type: "text", text: text });
        return null;
      }

      var bindParts = parts[0].trim().split(",", 2);
      bindName = bindParts[0].trim();
      if (bindParts[1]) {
        bindKey = bindParts[1].trim();
      }

      arrayExpr = parts[1].trim();
      array = this.evalExpression(arrayExpr);

      if (typeof array.length !== "number") {
        // Arrays constructed inside the VM context are not instances
        // of the same Array as ours: we cannot check with the 'instanceof' operator.
        console.error(":each: not an array");
      }

      return this.captureLevelEvents();

    }.bind(this))

    .then(function(buffer) {
      if (buffer) {
        // console.log("BUFFER", buffer);
        var idx = 0;

        var _iterate = function () {
          var obj = {};
          obj[bindName] = array[idx];

          if (bindKey) {
            obj[bindKey] = idx;
          }
          var releaseContext = _maskProperties(obj, this.vmContext);

          return this.playBuffer(buffer).then(function() {
            // after "play" completes...

            releaseContext();
            idx++;
            if (idx < array.length) {
              return _iterate();
            } else {
              // the task is finished
              return null;
            }
          });
        }.bind(this);

        if (array.length > 0) {
          return _iterate();
        }
      }
      return Q.resolve(null);

    }.bind(this)).done();
};

/**
 * Alternative syntax: "::" instead of ":on"
 *
 * Syntax:  :: <selector> [as <binding>]
 *
 * <selector> can take different forms:
 *   "some-element"   : matches any START event named "some-element"
 *   "/some-element"  : same, but only direct children (not all descendants)
 *   "some-element/"  : captures the whole tree under the element,
 *                       including some-element itself (outer capture)
 *   "some-element/~" : captures the whole tree under the element,
 *                       excluding some-element itself (inner capture)
 *   "*"              : capture any event (compatible with "/*" but not "* /")
 *   "/#"             : captures any text which is a direct child
 *
 * <binding> specifies where the event or event array is saved. It can be:
 *   - a variable name;                 example: myElement
 *   - an object name with propery;     exemple: myElement.title
 *   - a variable name / obj property to concatenate the value to;
 *                                      example: myElement[] or myElement.caption[]
 *
 *
 * // Binding expression (valid argument to ":on" and "::"):
 * //   "title := /TEXT"  : matches only once within the current scope,
 * //                       affects variable "title"
 * //   "blocs += /bloc/" : append

 */
Trees2proc.prototype.command_on = function (event) {
  var bindName = "_";
  var selector, affect = "=";
  var directChild = false, wholeTree = false, outerTree = false;

  this.captureFirstText()

    .then(function(text) {

      var parse = /^([^ ]+)( +as +(.*))?$/i.exec(text);
      selector = (""+parse[1]).trim();
      bindName = (""+(parse[3] || selector)).trim();

      if (!selector) {
        throw new Error("Invalid template selector/alias: "+text);
      }
      parse = /^(\/)?([^/]+)(\/)?$/.exec(selector);
      selector = parse[2];
      if (parse[1]) { // leading slash
        directChild = true;
      }
      if (parse[3]) { // trailing slash
        wholeTree = true;
      }

      return this.captureLevelEvents();
    }.bind(this))

    .then(function(templateBuffer /* of events to apply when selector is met */) {

      console.log("matching selector:", selector);
      console.log("templateBuffer", templateBuffer);

      // Function to be called when selector is matched.
      // It is responsable for processing the event, capture following events, etc.
      this.addMatch(selector, function(event, selectors) {


        console.log("matched event: ", event, typeof templateBuffer);

        // HERE: unshift input buffer back to IN
        var levelStream = new EndWithLevelStream(); // IN <- current proc IN
        var templateReadable = new ArrayPrependStream(templateBuffer); // OUT -> current proc IN // IN <- levelStream


        this.transformChain.unshiftReadables(this, [
          new EndWithLevelStream(),
          new ArrayPrependStream(templateBuffer),
        ])
          .then(function() {
            console.log("unshiftReadables() finished!");
          });


        // ArrayPrependStream repipe automatiquement son input sur son output

        // var templateStream = new ProcTemplateStream(this);
        // var templateStream = new ProcTemplateStream(this, templateBuffer);
        // return this.atLevelEnd().then(function(
        // this.transformChain.connectSide("<", this, templateStream);
        // this.prependStream(templateStream);
        // return this.processFromStream(templateStream)
        //   .then(function() {
        //     // at this point, the listeners setup by processFromStream() have
        //     // replaced our stdin with the former input stream
        //   });
        // return templateStream.atEof.then();

        //////////////////////////////////////////////////////////////////////
        // // Process what has been captured (which can be an attr value, a buffer...).
        // var apply = function(value, useContinuation) {

        // if (useContinuation) {
        //   // remember where we were before unshifting the buffered template
        //   // (for command ":through")
        //   this.continuationPositions.unshift(this.eventQueue.length);
        // }

        // // First: bind it to a variable according to 'affect' (=, :=, +=)
        // switch (affect) {
        //  case "=":
        //   this.vmContext[bindName] = value;
        //   break;

        //  case ":=":
        //   // if (this.vmContext[bindName] === null || this.vmContext[bindName] === undefined) {
        //   //   this.vmContext[bindName] = value;
        //   // }
        //   this.vmContext[bindName] = value;
        //   if (this.levelState[0].selectors[selector] === handler) {
        //     // console.log("REMOVING single use handler for selector:", selector);
        //     delete this.levelState[0].selectors[selector];
        //   }
        //   break;

        //  case "+=":
        //   if (!this.vmContext[bindName]) {
        //     this.vmContext[bindName] = [];
        //   }
        //   // console.log("pushing into", bindName, ":", value);
        //   this.vmContext[bindName].push(value);
        //   break;
        // }
        // // var release = _maskProperties(vars, this.vmContext);

        // // Second: play the template buffer
        // this.playBuffer(templateBuffer)
        //   .then(function() {
        //     // console.log("ON: DONE playing", bindName, "=", selector);
        //     // release();

        //     if (useContinuation) {
        //       var uncontinued = this.continuationPositions[0] != null;
        //       this.continuationPositions.shift();
        //       if (uncontinued/* && event.type == "start"*/) {
        //         // throw away what didn't get through
        //         // this.debugInfo("throwing away what didn't get through");
        //         return this.captureLevelEvents(true);
        //       } else {
        //         // this.debugInfo("did go through");
        //       }
        //     }
        //     return null;
        // }.bind(this).done();
        // }.bind(this); // end of: var apply = function...

        // switch (event.type) {
        // case "text":
        //   apply(event.text, false);
        //   break;
        // case "attr":
        //   apply(event.value, false);
        //   break;
        // case "start":
        //   if (wholeTree) {
        //     this.captureLevelEvents().then(function(events) {
        //       events.unshift(event);
        //       events.push({ type: "end" });
        //       apply(events, false);
        //     });
        //   } else {
        //     apply(event, true);
        //   }
        //   break;
        // }


      }.bind(this)); // end of: var handler = function...

      // handler.shiftLevelMatch = function(selectors, name) {
      //   if (!directChild) {
      //     selectors[selector] = handler;
      //   }
      // };
    }.bind(this)).done();

};
Trees2proc.prototype.command_debug = function (event) {
  var text;
  return this.captureFirstText()
    .then(function(_text) {
      text = _text;
      return this.evalExpression(text);
    }.bind(this))
    .then(function(value) {
      // console.log("VALUE!!!!!!!!!!", value);
      this.debugInfo(text + " = " + JSON.stringify(value));
      return this.captureLevelEvents();
    }.bind(this)).done();
};

Trees2proc.prototype.command_in = function (event) {
  this.captureFirstText()
    .then(function(text) {
      if (/^-/.test(text)) {
        // commmand
        var origOutput = this.transformChain.getSide(">", this);
        var unit = new _Class({ creatorProc: this });
        // this.transformChain.connectSide(">", this, null);
        this.transformChain.connectSide("<", this, new EndWithLevelStream(this));
        this.transformChain.connectSide("<", this, this.cloneStream());
        this.transformChain.connectSide("<", this, unit);
        return this.atLevelEnd()
          .then(function() {
            // LeveStream has automatically cut cloneStream and unit off the transform chain
          });

      } else if ("-" == text) {
        var input1 = this.transformChain.getSide("<", this);
        var input2 = this.transformChain.getSide("<", input1);
        this.transformChain.connectSide("<", this, input2);
        return input2.atEof() //...
          .then(function() {
            this.transformChain.connectSide("<", this, input1);
          });
        // this.levelState[0].alternative
      } else {
        this.transformChain.connectSide(
          "<", this, new ArrayPrependStream(this, this.vmContext[text]));
      }

    }.bind(this));
};

Trees2proc.prototype.command_out = function (event) {
  this.captureFirstText()
    .then(function(text) {
      var origOutput = this.transformChain.getSide(">", this);
      var p;

      if (/^-/.test(text)) {
        // commmand

        // this.levelSubStream(

        var _Class; //...
        var transform = new _Class();
        var unit = new _Class({ creatorProc: this });
        // this.transformChain.connectSide(">", this, null);
        this.transformChain.connectSide(">", this, unit);
        this.transformChain.connectSide("<", this, new EndWithLevelStream(this));


      } else {
        // variable
        var writable = new ToVariableWritable(this.vmContext, text);
        this.transformChain.connectSide(">", this, null);
        this.transformChain.connectSide(">", this, writable);

        // var readable = new LevelRemainingReadable(this);
      }
      return this.atLevelEnd()
        .then(function() {
          this.transformChain.connectSide(">", this, origOutput);
        }.bind(this));
    }.bind(this));
};

// Trees2proc.prototype.command_through = function (event) {
//   var expr;

//   this.captureFirstText()
//     .then(function(text) {
//       // console.log("through arg:", text);
//       expr = text;

//       return this.captureLevelEvents(true);
//     }.bind(this))
//     .then(function() {
//       var buffer;

//       if (expr) {
//         // MODE: from expression (unshift stream from variable/expression)
//         buffer = this.evalExpression(expr);
//         // console.log("':through' expression value", buffer);
//         if (!(buffer instanceof Array)) {
//           throw new Error(":through: arg does not evaluate to an array");
//         } else {
//           if (buffer[0] instanceof Array) { // an array of arrays is concatenated
//             // buffer = [].concat(buffer);
//             // buffer = Array.prototype.push.apply([], buffer);
//             var tmp = [];
//             for (var i = 0; i < buffer.length; i++) {
//               tmp.push.apply(tmp, buffer[i]);
//             }
//             buffer = tmp;
//             // console.log("!!!!!!!!!!!! buffer", typeof buffer, buffer instanceof Array, buffer);
//           }
//           return this.playBuffer(buffer);
//           // this.eventQueue.unshift.apply(this.eventQueue, buffer);
//         }

//       } else {
//         // MODE: from buffer continuation

//         if (!this.continuationPositions.length) {
//           console.log("WARN: command :through called outside of ':on' context");
//         } else if (this.continuationPositions[0] === null) {
//           console.log("WARN: command :through called twice for the same ':on' context");
//         } else {
//           var idx = this.eventQueue.length - this.continuationPositions[0];
//           buffer = this.eventQueue.splice(0, idx);
//           this.continuationPositions[0] = null;
//           this.levelState[0].onEnd = function() {
//             this.eventQueue.unshift.apply(this.eventQueue, buffer);
//           }.bind(this);
//         }
//         return null;
//       }
//     }.bind(this))
//     .done();
// };

// /**
//  * COMMAND ":serialize": install a fresh new textree2xml serializer
//  */
// Trees2proc.prototype.command_serialize = function (event) {
//   this.captureLevelEvents(true)
//     .then(function() {
//       this.transformChain.connectSide(">", this, new Trees2xml());
//     }.bind(this)).done();
// };

// /**
//  * COMMAND ":source": install a fresh new text2textree parser
//  */
// Trees2proc.prototype.command_source = function (event) {
//   var path;
//   this.captureFirstText()
//     .then(function(text) {
//       path = text;
//       return this.captureLevelEvents(true);
//     }.bind(this))
//     .then(function() {
//       this.sourceFile(path);
//     }.bind(this))
//     .done();
// };

// /**
//  * Command ":end": disconnect input (which is often a text2textree parser)
//  *
//  * This is necessary to end the input ; end-of-file is not enough as the pipe
//  * is still active in case other file are fed into the pipe.
//  */
// Trees2proc.prototype.command_end = function () {
//   this.captureLevelEvents(true)
//     .then(function() {
//       this.transformChain.connectSide("<", this, null);
//       this.end();
//     }.bind(this)).done();
// };

// /**
//  * Install a fresh new textree parser at input to source the given file
//  *
//  * Used by commands ":source" and ":shift-directory".
//  */
// Trees2proc.prototype.sourceFile = function (path) {

//   return env.getPath(path)
//     .then(function(entry) {
//       return Q.nfcall(entry.getBlob.bind(entry));
//     }.bind(this))
//     .then(function(blob) {
//       // console.log("BLOB", path);
//       var text2trees = new Text2trees();
//       this.transformChain.connectSide("<", this, null);
//       this.transformChain.connectSide("<", this, text2trees);
//       text2trees.end(blob);
//     }.bind(this));
// };

// /**
//  * Source the given file as raw content.
//  *
//  * (similar to sourceFile() but do not install a parser, just a CatFile)
//  * Used by command ":shift-directory".
//  */
// Trees2proc.prototype.dumpFile = function (path) {
//   var output = this.transformChain.getSide(">", this);
//   var cat = new CatFile();
//   this.transformChain.connectSide("<", output, null);
//   this.transformChain.connectSide("<", output, cat);
//   this.end();
//   cat.end({ path: path });
// };

/**
 * COMMAND ":shift-directory": process next component of URL path
 *
 * Thsi command is responsible for managing the "path" variable and
 * automatically source the next component to process, through
 * a textree parser if needed (or direct CatFile otherwise)
 * and manage errors.
 */
Trees2proc.prototype.command_shift_directory = function (event) {
  // console.log("shift...");
  var defer = Q.defer();

  this.captureLevelEvents(true, defer.promise)
    .then(function() {
      // console.log("2222", this.path);
      if (!this.path) {
        return null;
      }
      var entry = this.path.entry;
      if (!entry) {
        console.log("!ENTRY");
        // this.eventQueue.unshift(
        //   { type: "start", name: "error" },
        //   { type: "text", text: "not-found" },
        //   { type: "end" }
        // );
        // return null;
      } else if (entry.present) {
        if (entry.type == "directory") {
          return this.shiftPath().then(function() {
            // console.log("shifted");
            return this.sourceFile(this.path.processed.join("/")+"/directory.tt")
              .then(null, function(error) {
                this.eventQueue.unshift(
                  { type: "start", name: ":shift-directory" },
                  { type: "end" }
                );
              }.bind(this));
          }.bind(this));
        } else {
          var entryPath = this.path.processed.concat([entry.name]).join("/");
          // console.log("path to include", entryPath, pathUtils.extname(entryPath));
          var inputMode = pathUtils.extname(entryPath) == ".tt";

          if (inputMode) {
            this.transformChain.connectSide(">", this, new Trees2xml());
            return this.sourceFile(entryPath);
          } else {
            return this.dumpFile(entryPath);
          }
        }
      } else {
        console.log("entry not present", entry, this.path);
        this.eventQueue.unshift(
          { type: "start", name: "error" },
          { type: "text", text: "not-found" },
          { type: "end" }
        );
        return null;
      }
    }.bind(this))
    .then(defer.resolve.bind(defer))
    .done();
};

Trees2proc.prototype.loadPath = function (path) {

  this.path = { original: path.split("/"), processed: [] };
  this.path.remaining = this.path.original;
  return this.loadEntry();
};
Trees2proc.prototype.loadEntry = function () {
  var name = this.path.remaining[0];
  if (!name) {
    name = "index.tt";
    // this.path.entry = null;
    // return Q.resolve(null);
  }
  // else {
  var entryPath = this.path.processed.concat([name]).join("/");
  var entry = this.path.entry = { name: name, path: entryPath };

  return env.getPath(entryPath).then(
    function(gitEntry) {
      entry.present = true;
      entry.type = gitEntry.isTree() ? "directory" : "file";
    }.bind(this),
    function(error) {
      console.log("error!!!!!!", error);
      entry.present = false;
    }.bind(this))
    .then(function() {
      console.log("set context", JSON.stringify(this.path));
      this.vmContext.path = this.path;
    }.bind(this));

  // }
};

/**
 * Shift current path (used by the ":shift-directory" command).
 *
 * Similar to the shell "shift" call.
 */
Trees2proc.prototype.shiftPath = function () {
  this.path.processed.push(this.path.remaining.shift());
  return this.loadEntry();
};


////////////////////////////////////////////////////////////////////////////////
// CAPTURE functions - return a promise about what has been captured
//   (used by COMMAND functions)

/**
 * Capture first-child-text
 *
 * @return {promise} will be resolved with the concatenated text
 */
Trees2proc.prototype.captureFirstText = function () {
  var def = Q.defer();
  var text = "";

  this.contextStack.push(function(event) {
    switch (event.type) {
    case "text":
      text += event.text;
      return;
    case "start": // a child
    case "end": // with or without text
      this.contextStack.pop(); // means a return
      this.eventQueue.unshift(event); // will be processed normally
      def.resolve(text);
      // this.process(event);
      break;
    default:
    }

  });

  return def.promise;
};

/**
 * Capture first-child-text and evaluate it as a JS expression
 *
 * @return {promise} will be resolved with the value of the evaluation
 */
Trees2proc.prototype.captureTextAndEval = function () {
  return this.captureFirstText().then(this.evalExpression.bind(this));
};

/**
 * Capture all next events until end of level (next stop event for current level)
 *
 * @return {promise} will be resolved with an array of the events
 */
Trees2proc.prototype.captureLevelEvents = function (dontBuffer, processPromise) {
  var buffer = [];
  var def = Q.defer();
  var depth = 0;

  this.contextStack.push(function(event) {
    switch (event.type) {
    case "start": depth++; break;
    case "end": depth--; break;
    }
    if (depth >= 0) {
      if (dontBuffer) {
        // console.log("throwing event", event);
      } else {
        buffer.push(event);
      }
    } else {
      this.shiftLevel();
      this.contextStack.pop();
      def.resolve(buffer);

      return processPromise ? processPromise : null;
    }
  }.bind(this));

  return def.promise;
};


// Trees2proc.prototype. = function (event, encoding, done) {

////////////////////////////////////////////////////////////////////////////////
// INTERNAL FUNCTIONALITY

Trees2proc.prototype._transform = function (event, encoding, done) {

  // console.log("PROC _transform", event);
  this.eventQueue.push(event);

  var loop = function() {
    while (this.eventQueue[0]) {
      var ret = this.processEvent(this.eventQueue.shift());
      if (ret && ret.then) {
        ret.then(loop);
        return;
      }
    }
    done();
  }.bind(this);

  loop();
};

Trees2proc.prototype._flush = function (done) {
  if (done) {
    done();
  }
};

Trees2proc.prototype.processEvent = function (event) {
  switch (event.type) {

  case "_callback":
    // this.debugInfo("CALLBACK");
    event.callback.call(this);
    return null;

    // case "start":
    //  break;
    // case  "end":
    //  break;
  }
  var func = this.contextStack[this.contextStack.length - 1];
  return func.call(this, event);

};

Trees2proc.prototype.unshiftLevel = function (event) {
  this.levelState.unshift({ tag: event.name, selectors: {} });

  // function _F() {}
  // _F.prototype = this.levelState[0].selectors;
  // this.levelState.unshift({ tag: event.name, selectors: new _F() });

  // var selectors = this.levelState[0].selectors;
  // var newSelectors = {};
  // for (var key in selectors) {
  //   selectors[key].shiftLevelMatch(newSelectors, event.name);
  // }
  // this.levelState.unshift({ tag: event.name, selectors: newSelectors });
};

Trees2proc.prototype.shiftLevel = function () {
  var level = this.levelState.shift();
  if (!this.levelState[0]) {
    throw new Error("unmatched END event!");
  }
  if (level && level.onEnd) {
    if (!level.onEnd.call(this)) {
      return false; // hook can return false to get the event ignored
    }
  }
  return true;
};

Trees2proc.prototype.evalExpression = function (expr) {
  // console.log("evaluating expression:", expr);
  try {
    var value = vm.runInContext(expr, this.vmContext);
  }
  catch (e) {
    console.error(":eval expression failed: <<", expr, ">> error is:", e);
    value = e;
  }
  return value;
};

Trees2proc.prototype.playBuffer = function (buffer) {
  var def = Q.defer();

  this.eventQueue = buffer.concat(
    [{type:"_callback", callback: def.resolve.bind(def)}],
    this.eventQueue);

  return def.promise;
};

/**
 * Attach a handler for a selector, will be applied on matched 'start' events
 *
 * The handler will be called with the 'this' scope.
 * Selector's recursivity is managed here (ie. "my/sub/element"),
 * BUT not any trailing slash, which means "caputure the whole thing"
 * which is managed by command_on().
 */
Trees2proc.prototype.addMatch = function (selector, handler, parentLevel) {
  // console.log("addMatch", parentLevel, selector);
  var selectors = this.levelState[parentLevel || 0].selectors;
  // var wrapper = function(event) {
  //   this.push(event);
  //   return handler.apply(this, arguments);
  // }.bind(this);
  // var parts = selector.split("/", 2);
  // wrapper.onLevelEnter = function(name) {
  //   if (parts[1]) {
  //   this.addMatch(parts[1],
  // }.bind(this);
  // selectors[parts[0]] = handler;
  selectors[selector] = handler;
};

Trees2proc.prototype.debugInfo = function () {
  console.log("DEBUG ", arguments[0]);
  console.log("*** queue #", this.eventQueue.length, this.eventQueue);
  console.log("*** levelState #", this.levelState.length,
              this.levelState.map(function(level) {return level.tag;}).join(" < "));
  console.log("*** contextStack #", this.contextStack.length);
};
Trees2proc.prototype.debugQueue = function () {
  console.log("DEBUG ", arguments, "queue#", this.eventQueue.length,
              this.eventQueue);
};


////////////////////////////////////////////////////////////////////////////////
// UTIL FUNCTIONS

/**
 * Copy properties of newObj into maskedObj but keep a backup to restore later
 *
 * @return {Function} Release function: the caller should call il to restore the backed-up value
 */
function _maskProperties(newObj, maskedObj) {
  var values = {};
  var present = {};

  // console.log("MASK", newObj);
  for (var key in newObj) {
    if ((present[key] = maskedObj.hasOwnProperty(key))) {
      values[key] = maskedObj[key];
    }
    maskedObj[key] = newObj[key];
  }

  return function() {
    // console.log("FREE", newObj, present);
    for (var key in present) {
      if (present[key]) {
        maskedObj[key] = values[key];
      } else {
        delete maskedObj[key];
      }
    }
  };
}
