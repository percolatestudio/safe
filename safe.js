/* global SimpleSchema, FlashNotifications, ValidationError */
/* global Safe:true */
/** @namespace */
Safe = {};

/**
 * Cleans + Validates the doc (in place) according to a SimpleSchema.
 * @param {Object} docOrMod - The document or modifier to use.
 * @param {SimpleSchema} simpleSchema - The SS to use for validation.
 * @param {Object} options - Options.
 * @returns {(Object|undefined)} An error object like {fieldName: errorString}
 *   or undefined if the document validates.
 */
Safe.validate = function(docOrMod, simpleSchema, options) {
  check(docOrMod, Object);
  check(simpleSchema, SimpleSchema);

  options = _.extend({
    isModifier: false,
    context: simpleSchema.newContext()
  }, options);

  check(options, {
    // Is docOrMod a modifier?
    isModifier: Boolean,
    // SimpleSchemaValidationContext (SS doesn't export the symbol)
    context: simpleSchema.newContext().constructor
  });

  // If the schema includes a 'prepare' hook, run it.
  if (_.isFunction(simpleSchema.prepare)) {
    var doc = docOrMod;
    var params = {isUpdate: false};
    if (options.isModifier) {
      doc = docOrMod.$set || {};
      params = {
        isUpdate: true,
        modifier: docOrMod
      };
    }

    // The attributes we're setting. If the operation is modifier, and there is
    // a $set component, this will be it.
    check(doc, Object);
    check(params, {
      // Are we doing an update?
      isUpdate: Boolean,
      // If we have a modifier, it's in here
      modifier: Match.Optional(Object)
    });

    simpleSchema.prepare(doc, params);
  }

  simpleSchema.clean(docOrMod, {isModifier: options.isModifier, filter: false,
    trimString: false});

  if (!options.context.validate(docOrMod, {modifier: options.isModifier})) {
    var errors = {};

    _.each(options.context.getErrorObject().invalidKeys, function(x) {
      errors[x.name] = x.message;
    });

    throw new Safe.ValidationError(errors);
  }
};

/**
 * Throws a ForbiddenError if you're not logged in.
 * @returns {void}
 */
Safe.checkLoggedIn = function() {
  if (!Meteor.userId()) {
    throw new Safe.ForbiddenError("You must be logged in");
  }
};

/**
 * Wraps Meteor.subscribe and logs a notification if there was an error
 * @param {...*} arguments - @see Meteor.subscribe
 * @returns {*} @see Meteor.subscribe
 */
Safe.subscribe = function() {
  var args = Array.prototype.slice.call(arguments);
  var final = _.last(args);
  var callbacks = {};

  // If callbacks are present, save a reference and remove them from args
  if (_.isObject(final)
      && (_.isFunction(final.onReady) || _.isFunction(final.onError))) {
    _.extend(callbacks, final);
    args.pop();
  }
  else if (_.isFunction(final)) {
    callbacks.onReady = final;
    args.pop();
  }

  args.push({
    onReady: function() {
      if (_.isFunction(callbacks.onReady)) {
        callbacks.onReady.call();
      }
    },
    onError: function() {
      Log.error(arguments);

      FlashNotifications.add({
        title: "Subscription Error",
        description: "Failed to to subscribe to '" + _.first(args) + "'",
        icon: "alert",
        feeling: "negative"
      });

      if (_.isFunction(callbacks.onError)) {
        callbacks.onError.apply(null, arguments);
      }
    }
  });

  return Meteor.subscribe.apply(null, args);
};

/**
 * Wraps Meteor.call and logs a notification if there was an error
 * @param {String} name Name of method to invoke
 * @param {...*} arguments - @see Meteor.call
 * @param {Function} callback - usually a Safe.okHandler, but optionally function(e, r)
 * @returns {*} @see Meteor.call
 */
Safe.call = function (name) {
  // if it's a function, the last argument is the result callback,
  // not a parameter to the remote method.
  var args = Array.prototype.slice.call(arguments, 1);
  if (args.length && typeof args[args.length - 1] === "function") {
    var callback = args.pop();
  }
  try {
    Meteor.apply(name, args, {throwStubExceptions: true}, callback);
  }
  catch(e) {
    callback(e);
  }
};

// POC for the most basic of re-usable method handlers that corresponds to our
// proposed generic return interface for mutating methods
if (Meteor.isServer) {
  // On the server we throw when not ok
  Safe.okHandler = function(okCb) {
    return function(e, r) {
      if (e) {
        console.error(e.details);
        throw e;
      }
      else if (_.isFunction(okCb)) {
        okCb(r);
      }
    };
  };
}
else {
  // On the client use Flash Notifications
  Safe.okHandler = function(okCb, template) {
    return function(e, r) {
      var report = function(log, description) {
        if (log) {
          console.error(log);
        }
        if (description) {
          console.error(description);
        }
        FlashNotifications.add({
          title: "Operation Failed",
          description: description,
          icon: "alert",
          feeling: "negative"
        });
      };

      if (e instanceof Safe.ValidationError) {
        // If a template is passed in, use it's error mechanism
        if (template && _.isFunction(template.onError)) {
          template.onError(e.details);
        }
        else {
          report(e.details, "Validation error");
        }
      }
      else if (e instanceof Match.Error) {
        report("Match Failed", "Validation error");
      }
      else if (e) {
        report(e, e.reason + ", " + e.details);
      }
      else if (_.isFunction(okCb)) {
        okCb(r);
      }
    };
  };
}

Safe.Match = {};

/**
 * Will match an object optionally containing only keys from a whitelist.
 * @param {Array} allowedKeys - The whitelisted keys.
 * @returns {boolean} true if the object passes the test.
 */
Safe.Match.WhitelistedObject = function(allowedKeys) {
  return Match.Where(function(x) {
    var schema = {};

    _.each(allowedKeys, function(key) {
      schema[key] = Match.Optional(Match.Any);
    });

    check(x, schema);
    return true;
  });
};

Safe.Match.RegEx = function(exp) {
  return Match.Where(function(x) {
    return x.match(exp);
  });
};

Safe.SimpleSchema = {
  RegEx: {
    // Old id's we have lying around for some imported data that contain 0's
    // and 1's unlike Meteor's ids which don't
    OldId: /^[0123456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz]{17}$/,

    // Taken from https://gist.github.com/dperini/729294/543514ef4ef5be998de55bf11349298459925cbe
    // This is the same RegExp that SimpleSchema uses but we've made the TLD
    // optional, thus allowing localhost urls to pass the regular expression
    Url: new RegExp(
      "^"
        // protocol identifier
        + "(?:(?:https?|ftp)://)"
        // user:pass authentication
        + "(?:\\S+(?::\\S*)?@)?"
        + "(?:"
          // IP address exclusion
          // private & local networks
          + "(?!(?:10|127)(?:\\.\\d{1,3}){3})"
          + "(?!(?:169\\.254|192\\.168)(?:\\.\\d{1,3}){2})"
          + "(?!172\\.(?:1[6-9]|2\\d|3[0-1])(?:\\.\\d{1,3}){2})"
          // IP address dotted notation octets
          // excludes loopback network 0.0.0.0
          // excludes reserved space >= 224.0.0.0
          // excludes network & broacast addresses
          // (first & last IP address of each class)
          + "(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])"
          + "(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}"
          + "(?:\\.(?:[1-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))"
        + "|"
          // host name
          + "(?:(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)"
          // domain name
          + "(?:\\.(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)*"
          // TLD identifier
          + "(?:\\.(?:[a-z\\u00a1-\\uffff]{2,}))?"
        + ")"
        // port number
        + "(?::\\d{2,5})?"
        // resource path
        + "(?:/\\S*)?"
      + "$", "i"
    )
  }
};
