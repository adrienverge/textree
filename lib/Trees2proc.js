
var stream = require('stream');
var util = require("util");
var events = require("events");
var HamlNode = require("./HamlNode");
var Q = require("kew");
var vm = require("vm");


function Trees2proc(options) {
  if (!options) { options = {}; }
  options.objectMode = true;
  stream.Transform.call(this, options);

  this.level = -1;
  // list of templates
  this.templates = [];
  this.templatesMatches = {};

  // queue of events to process (starting with [0])
  this.eventQueue = [];

  // execution stack (current is [index - 1])
  this.contextStack = [this.executeDefault];

  // input-level (start/stop) state stack (current is [0])
  // initialized with root level
  this.levelState = [{selectors: {}}];

  // NodeJS VM context of JS expr evaluations
  this.vmContext = vm.createContext({});

  // Object of arrays of functions, keys are element names
  // can be "element", "@domain" or "element@domain"
  // this.selectors = {};

  // // Stack of variable values that shall get restored.
  // // [0] is supposed to be in the environment
  // this.vmMaskStack = [];

  // [0] is the negative address if the latest continuation break (":on")
  // For example, 42 means the continuation is at eventQueue[eventQueue.index - 42].
  // Unshifted and shifted by ":on", shifted also by ":through"
  this.continuationPositions = [];

}

util.inherits(Trees2proc, stream.Transform);
module.exports = Trees2proc;


////////////////////////////////////////////////////////////////////////////////
// COMMAND FUNCTIONS

Trees2proc.prototype.executeDefault = function (event) {
  var selName;

  // console.log("executeDefault", event);
  switch (event.type) {

   case "start":
    this.unshiftLevel(event);
    if (event.name[0] == ":") {
      var fname = "command_"+event.name.slice(1);
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
    selName = event.name;
    this.lastStart = event;
    break;

   case "end":
    if (this.shiftLevel(event) === false) {
      return null;
    }
    break;

   case "text":
    if (event.text[0] === "=") {
      return this.op_set(event);
      // // rewrite "toto = 42" to ":set toto= 42"
      // this.eventQueue.unshift(
      //   { type: "start", name: ":set" },
      //   { type: "text", text: this.lastStart.name+event.text },
      //   { type: "end" }
      // );
      // console.log("EQ", this.eventQueue);
      // return null;
    }
    selName = "TEXT";
    break;
  }

  // check selectors
  var selectors = this.levelState[0].selectors;
  if (selName && selectors[selName]) {
    return selectors[selName].call(this, event);
  }

  this.push(event);
  return null;
};

/**
 * @param {object} textEvent
 */
Trees2proc.prototype.op_set = function (textEvent) {
  this.evalExpression(this.lastStart.name+textEvent.text);
  this.captureSubLevelEvents(true).done();
};

/**
 * element= expression // expression is inserted as first child/children
 * Can be fed with a javascript or
 */
Trees2proc.prototype.op_affect = function (event) {
  this.captureTextAndEval().then(function(value) {
    if (value instanceof Error) {
      value = "[JS expression error: "+value+"]";
    }
    this.push({ type: event.type, name: event.name.replace(/=$/, "") });
    this.push({ type: "text", text: ""+value });
    // this.eventQueue.unshift(
    //   { type: event.type, name: event.name.replace(/=$/, "") },
    //   { type: "text", text: ""+value });
  }.bind(this)).done();
};

/**
 * Example:
 *   :eval variable = expression
 */
Trees2proc.prototype.command_eval = function (event) {
  this.captureFirstText()
    .then(this.evalExpression.bind(this))
    .then(this.captureSubLevelEvents.bind(this, true))
    .done();
};

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
      return this.captureSubLevelEvents(true);
      // this.contextStack.push(function(event) {
      // });
      // this.levelState[0].onEnd =
      //   // except when level gets shifted, we "return" (pop)
      //   function(event) { this.contextStack.pop(); return false; };
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

      if (!(array instanceof Array)) {
        console.error(":each: not an array");
      }

      return this.captureSubLevelEvents();

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
 * Attach a handler for a selector, will be applied on matched 'start' events
 *
 * The handler will be called with the 'this' scope.
 */
Trees2proc.prototype.addMatch = function (selector, handler, parentLevel) {
  var selectors = this.levelState[parentLevel || 0].selectors;
  selectors[selector] = handler;
  // var arr;
  // if (!(arr = selectors[selector])) {
  //   arr = selectors[selector] = [];
  // }
  // arr.unshift(handler);
};

/**
 * Alternative syntax: "::" instead of ":on"
 */
Trees2proc.prototype.command_on = function (event) {
  var bindName;
  var selector;
  var prevUnderscore;

  this.captureFirstText()

    .then(function(text) {

      var parts = text.split(/ as /i);
      selector = parts[0].trim();
      bindName = (parts[1] || "_").trim();

      // console.log("TEMPLATE", bindName, "--", selector);

      // this.debugInfo("111111111111");
      return this.captureSubLevelEvents();
    }.bind(this))

    .then(function(buffer /* of events to apply when selector is met */) {

      // this.debugInfo("22222222222");
      // declare the function to be called when selector is matched
      this.addMatch(selector, function(event /* met event */) {

        this.continuationPositions.unshift(this.eventQueue.length);
        // var didThrough = false;
        // this.eventQueue.unshift({ type: "_callback", callback: function() {
        //   didThrough = true;
        // }});

        // this.debugInfo("MATCH TEMPLATE");
        // console.log("MATCH TEMPLATE", bindName, selector);

        this.throughPos = this.eventQueue.length;

        // restore
        // this.eventQueue.unshift(event);
        var wasClosed = false;
        if (event.type == "start") {
          this.levelState[0].onEnd = function(stopEvent) {
            // console.log("END CONTENT", selector);
            // don't ignore stop event
            wasClosed = true;
            return true;
          };
        }

        var underscore = event;
        if (event.type == "text") {
          underscore = event.text;
        }

        var release = _maskProperties({ _: underscore }, this.vmContext);
        this.playBuffer(buffer)
          .then(function() {
            // console.log("ON: DONE playing", buffer);
            release();

            // if (this.throughPos !== undefined) {
            var uncontinued = this.continuationPositions[0] != null;
            this.continuationPositions.shift();
            if (uncontinued) {
              // this.debugInfo("throwing away what didn't get through");
              return this.captureSubLevelEvents(true);
            } else {
              // this.debugInfo("did go through");
              // this.shiftLevel();
            }
            return null;
          }.bind(this)).done();

      });
    }.bind(this)).done();

};
Trees2proc.prototype.command_debug = function (event) {
  this.debugInfo(":DEBUG");
  this.captureSubLevelEvents().done();
};

Trees2proc.prototype.command_through = function (event) {
  this.captureSubLevelEvents(true)
    .then(function() {
      if (!this.continuationPositions.length) {
        console.log("WARN: command :through called outside of ':on' context");
      } else {
        var idx = this.eventQueue.length - this.continuationPositions[0];
        var buffer = this.eventQueue.splice(0, idx);
        this.continuationPositions[0] = null;
        this.levelState[0].onEnd = function() {
          // this.debugInfo("this.eventQueue END1");
          this.eventQueue.unshift.apply(this.eventQueue, buffer);
        }.bind(this);
      }
    }.bind(this))
    .done();
};

Trees2proc.prototype.command_match = function (event) {
  var bindName;
  var selector;
  var prevUnderscore;

  this.captureFirstText()

    .then(function(text) {

      var parts = text.split(/ as /i);
      selector = parts[0].trim();
      bindName = (parts[1] || "_").trim();

      console.log("TEMPLATE", bindName, "--", selector);

      return this.captureSubLevelEvents();
    }.bind(this))

    .then(function(buffer) {

      // declare the function to be called when selector is matched
      this.addMatch(selector, function(event) {

        console.log("MATCH TEMPLATE", bindName, selector);

        this.captureSubLevelEvents()

          .then(function(input) {
            console.log("playing template buffer", buffer);
            //
            return this.playBuffer(buffer);
          }.bind(this))

          .then(function() {
            console.log("done playing");
          }.bind(this)).done();
      });

    }.bind(this)).done();
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

// Trees2proc.prototype.captureEnd = function () {
//   var def = Q.defer();
//   var text = "";

//   this.contextStack.push(function(event) {
//     // console.log("event end", event);
//     if (event.type == "end") {
//       this.contextStack.pop(); // means a return
//       this.shiftLevel(event);
//       def.resolve(event);
//     }
//   });

//   return def.promise;
// };

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
Trees2proc.prototype.captureSubLevelEvents = function (dontBuffer) {
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
        console.log("throwing event", event);
      } else {
        buffer.push(event);
      }
    } else {
      this.shiftLevel();
      this.contextStack.pop();
      def.resolve(buffer);
      return;
    }
  }.bind(this));
  // this.levelState[0].onEnd = function(event) {
  //   this.debugInfo("captureSubLevelEvents END");
  //   this.contextStack.pop();
  //   def.resolve(buffer);
  //   return false;
  // };

  return def.promise;
};


////////////////////////////////////////////////////////////////////////////////
// INTERNAL FUNCTIONALITY

Trees2proc.prototype._transform = function (event, encoding, done) {
  // console.log("transform", event);
  // this.process(event);

  this.eventQueue.push(event);
  while (this.eventQueue[0]) {
    this.processEvent(this.eventQueue.shift());
  }

  done();
};

Trees2proc.prototype._flush = function (done) {
  // console.log("flush");
  if (done) {
    done();
  }
};

Trees2proc.prototype.processEvent = function (event) {
  switch (event.type) {

   case "_callback":
    // this.debugInfo("CALLBACK");
    event.callback.call(this);
    return;

   case "start":
    break;

   case  "end":
    break;
  }
  var func = this.contextStack[this.contextStack.length - 1];
  func.call(this, event);
};

Trees2proc.prototype.unshiftLevel = function (event) {
  function _F() {}
  _F.prototype = this.levelState[0].selectors;
  this.levelState.unshift({ tag: event.name, selectors: new _F() });
};

Trees2proc.prototype.shiftLevel = function () {
  var level = this.levelState.shift();
    if (!this.levelState[0]) {
      throw new Error("unmatched END event!");
    }
  // console.log("level", level);
  if (level && level.onEnd) {
    if (!level.onEnd.call(this)) {
      // console.log("ignoring", event);
      return false; // hook can return false to get the event ignored
    }
  }
  return true;
};

Trees2proc.prototype.evalExpression = function (expr) {
  // console.log("captureTextAndEval: got expr", expr);
  try {
    var value = vm.runInContext(expr, this.vmContext);
    // console.log("captureTextAndEval: VALUE = ", value);
  }
  catch (e) {
    console.error(":eval expression failed: <<", expr, ">> error is:", e);
    value = e;
  }
  return value;
};

Trees2proc.prototype.playBuffer = function (buffer) {
  var def = Q.defer();
  // this.debugInfo("PRE QUEUING");
  // this.debugQueue("PRE QUEUING");

  this.eventQueue = buffer.concat(
    [{type:"_callback", callback: def.resolve.bind(def)}],
    this.eventQueue);
  // this.debugInfo("POST QUEUING");
  // this.debugQueue("POST QUEUING");

  return def.promise;
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
