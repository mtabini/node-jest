'use strict';

module.exports = {
  server : require('./lib/server')
};

var s = require('./lib/server')().listen(8000);

s.auth = function() {
  return 123;
}

s.route('test', function(cb) {
  // process.nextTick(function() {
  //   cb(null, 'a');
  // });

  // var p = Q.defer();

  // process.nextTick(function() {
  //   p.resolve(10);
  // });

  // return p.promise;
  
  return 123;
});

var Q = require('Q');

// function getValue(n) {
//   throw new Error('bb');
//   return n * 10;
// }

function getValue(n, cb) {
  return cb(null, n * 10);
}

// function getValue(n) {
//   var q = Q.defer();

//   process.nextTick(function() {
//     q.resolve(n * 10);
//   });

//   return q.promise;
// }

var defer = Q.defer();

var params = [10];
params.push(defer.makeNodeResolver());

Q.fapply(getValue, params).then(defer.resolve).fail(defer.reject);

// if (r && r.then) {
//   var p = r;
// } else {
  var p = defer.promise;
// }

p.then(function(v) { console.log(v) }).fail(function(err) { console.log(err); }).done();