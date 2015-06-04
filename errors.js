/* global Safe */

// Throw these from methods
Safe.ForbiddenError = function(details, reason) {
  Meteor.Error.call(this, 403, reason || "Forbidden", details);
};

Safe.ForbiddenError.prototype = new Meteor.Error();

Safe.NotFoundError = function(details, reason) {
  Meteor.Error.call(this, 404, reason || "Not Found", details);
};

Safe.NotFoundError.prototype = new Meteor.Error();

Safe.ValidationError = function(details, reason) {
  Meteor.Error.call(this, 400, reason || "Validation Error", details);
};
