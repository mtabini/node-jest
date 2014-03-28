'use strict';

var expect = require('chai').expect;

var jest = require('../index');

var server;

describe('The Jest client', function() {

  before(function(done) {
    server = jest.server();

    server.route('a.test', function(s, cb) {
      process.nextTick(function() {
        cb(null, s + '1');
      });
    });

    server.requireAuth = true;
    server.auth = function(auth, cb) {
      if (auth[0] == 123) {
        cb(null, 'ok');
      } else {
        cb(new Error('Unauthorized'));
      }
    };

    server.listen(8000, done);
  });
  
  it('should exist (you never know)', function() {
    expect(jest.client).to.be.a('function');
  });

  it('should support authentication', function(done) {
    var client = jest.client(
      {
        port: 8000
      }
    );

    client.auth = function(auth, cb) {
      process.nextTick(function() {
        cb(null, 123);
      });
    };

    client.on('ready', function() {
      done();
    });
  });

  after(function(done) {
    server.destroy(done);
  });

});