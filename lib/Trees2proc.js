
var stream = require('stream');
var util = require("util");
var events = require("events");
var HamlNode = require("./HamlNode");
var Q = require("kew");
var vm = require("vm");

/**
 * Copy properties of newObj into maskedObj but keep a backup
 * to restore later, when free() is called.
 */
function _maskProperties(newObj, maskedObj) {
  var values = {};
  var present = {};

  for (var key in newObj) {
    if ((present[key] = maskedObj.hasOwnProperty(key))) {
      values[key] = maskedObj(key);
    }
    maskedObj[key] = newObj[key];
  }

  return function() {
    for (var key in present) {
      if (present[key]) {
        maskedObj[key] = values[key];
      } else {
        delete maskedObj[key];
      }
    }
  };
}

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
  this.levelState = [];

  // NodeJS VM context of JS expr evaluations
  this.vmContext = vm.createContext({});

  // Object of arrays of functions, keys are element names
  // can be "element", "@domain" or "element@domain"
  this.selectors = {};

  // // Stack of variable values that shall get restored
  // // [0] is supposed to be in the environment
  // this.vmMaskStack = [];
}
util.inherits(Trees2proc, stream.Transform);


////////////////////////////////////////////////////////////////////////////////
// COMMAND FUNCTIONS

Trees2proc.prototype.executeDefault = function (event) {
  switch (event.type) {

   case "start":
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

    // check selectors
    var selectors = this.selectors;
    if (selectors[event.name] && selectors[event.name].length > 0) {
      return selectors[event.name][0].call(this, event);
    }

    this.lastStart = event;
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
    break;
  }
  this.push(event);
  return null;
};

/**
 * @param {object} textEvent
 */
Trees2proc.prototype.op_set = function (textEvent) {
  this.evalExpression(this.lastStart.name+textEvent.text);
  this.captureEnd().done();
};

/**
 * element= expression // expression is inserted as first child/children
 * Can be fed with a javascript or
 */
Trees2proc.prototype.op_affect = function (event) {
  event = { type: event.type, name: event.name.replace(/=$/, "") };
  this.push(event);
  this.captureTextAndEval().then(function(value) {
    if (value instanceof Error) {
      value = "[JS expression error: "+value+"]";
    }
    this.push({ type: "text", text: ""+value });
  }.bind(this)).done();
};

/**
 * Example:
 *   :eval variable = expression
 */
Trees2proc.prototype.command_eval = function (event) {
  this.captureFirstText()
    .then(this.evalExpression.bind(this))
    .then(this.captureEnd.bind(this))
    .done();
};

Trees2proc.prototype.command_if = function (event) {
  // this.levelState
  this.captureTextAndEval().then(function(value) {
    // console.log("if:value:", value, !!value);
    if (value instanceof Error) {
      this.push(event);
      this.push({ type: "text", text: "[JS expression error: "+value+"]" });
      return;
    }
    if (!!value) {
      // console.error("if IN", this.levelState, this);
      this.levelState[0].onEnd = function(event) { return false; };
    } else {
      // console.log("if OUT");
      this.contextStack.push( // do nothing
        function(event) { /*console.log("do nothing", event);*/ });
      this.levelState[0].onEnd = // except when level gets shifted, we "return" (pop)
      function(event) { this.contextStack.pop(); return false; };
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
Trees2proc.prototype.addMatch = function (selector, handler) {
  var arr;
    if (!(arr = this.selectors[selector])) {
      arr = this.selectors[selector] = [];
    }
  arr.unshift(handler);
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

      return this.captureSubLevelEvents(); // of
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
      this.eventQueue.unshift(event);
      def.resolve(text);
      // this.process(event);
      break;
    default:
    }

  });

  return def.promise;
};

Trees2proc.prototype.captureEnd = function () {
  var def = Q.defer();
  var text = "";

  this.contextStack.push(function(event) {
    // console.log("event end", event);
    if (event.type == "end") {
      this.contextStack.pop(); // means a return
      def.resolve(event);
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
Trees2proc.prototype.captureSubLevelEvents = function () {
  var buffer = [];
  var def = Q.defer();
  // this.debugInfo("captureSubLevelEvents");
  this.levelState[0].onEnd = function(event) {
    this.contextStack.pop();
    def.resolve(buffer);
    return false;
  };
  this.contextStack.push(function(event) {
    buffer.push(event);
  });

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
    this.levelState.unshift({tag: event.name});
    break;

   case  "end":
    var level = this.levelState.shift();
    // console.log("level", level);
    if (level && level.onEnd) {
      if (!level.onEnd.call(this, event)) {
        // console.log("ignoring", event);
        return; // hook can return false to get the event ignored
      }
    }
    break;
  }
  var func = this.contextStack[this.contextStack.length - 1];
  func.call(this, event);
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
  console.log("DEBUG ", arguments, "queue#", this.eventQueue.length,
              "-- levelState", "["+this.levelState.length+"]",
              this.levelState.map(function(level) {return level.tag;}).join(" < "),
              "-- contextStack=~", this.contextStack.length);
};
Trees2proc.prototype.debugQueue = function () {
  console.log("DEBUG ", arguments, "queue#", this.eventQueue.length,
              this.eventQueue);
};


////////////////////////////////////////////////////////////////////////////////

Trees2proc.prototype.___transform = function (event, encoding, done) {

  var name;

  if (event.type == "start") {
    this.level++;
  }
  var forward = true;

  // console.log("tr", this.level, event, "defining", this.defining && this.defining.level);
  if (this.defining) {
    // in template
    if (this.level == this.defining.level) {
      if (event.type == "end") {
        // this.defining.content.push(event);
        this.templates.push(this.defining);
        this.templatesMatches[this.defining.selector] = this.defining;
        // console.log("** pushed template", this.defining);
        this.defining = null;
        forward = false;

      } else if (event.type == "text") {
        this.defining.selector = event.text;
        forward = false;
      }
    } else if (this.level > this.defining.level) {
      this.defining.content.push(event);
      forward = false;
    }
  } else {

    if (event.type == "start") {
      if (event.name == ":apply") {
        this.defining = {type:"template",level:this.level,content:[]};
        forward = false;
      } else {
        var _t = this.templatesMatches[event.name];
        if (_t) {
          _t.content.forEach(function(tEevent) {
            this.push(tEevent);
          }, this);
        }
      }
    }
  }

  if (forward) {
    this.push(event);
  }

  if (event.type == "end") {
    this.level--;
  }

  done();
};


module.exports = Trees2proc;
