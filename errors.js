/* global Safe */

// Throw these from methods
Safe.ForbiddenError = function(details, reason) {
  Meteor.Error.call(this, "forbidden", reason || "Forbidden", details);
};

Safe.ForbiddenError.prototype = new Meteor.Error();

Safe.NotFoundError = function(details, reason) {
  Meteor.Error.call(this, "not-found", reason || "Not Found", details);
};

Safe.NotFoundError.prototype = new Meteor.Error();

Safe.ValidationError = function(details, reason) {
  Meteor.Error.call(this, "validation-failed", reason || "Validation Error", details);
};

Safe.ValidationError.prototype = new Meteor.Error();

