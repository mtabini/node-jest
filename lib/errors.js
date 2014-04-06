'use strict';

var util = require('util');

function AuthError(message) {
  Error.call(this);
  Error.captureStackTrace(this, this.constructor);

  this.name = this.constructor.name;
  this.message = message;
}

util.inherits(AuthError, Error);


function TimeoutError(message) {
  Error.call(this);
  Error.captureStackTrace(this, this.constructor);

  this.name = this.constructor.name;
  this.message = message;
}

util.inherits(TimeoutError, Error);


module.exports = {
  auth: AuthError,
  timeout: TimeoutError
};