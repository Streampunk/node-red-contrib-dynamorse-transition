/* Copyright 2017 Streampunk Media Ltd.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

var util = require('util');
var redioactive = require('node-red-contrib-dynamorse-core').Redioactive;
var TransValve = require('./transValve.js').TransValve;
var codecadon = require('codecadon');
var osc = require('osc');

function oscServer(port, node, map) {
  this.port = port;
  this.node = node;
  this.map = map;

  this.oscPort = new osc.UDPPort({
    localAddress: "0.0.0.0",
    localPort: this.port
  });

  this.oscPort.on("ready", () => {
    this.node.log(`OSC listening on port ${this.port}`);
  });

  this.oscPort.on("message", (oscMessage, timeTag, info) => {
    var address = oscMessage.address;
    var value = oscMessage.args[0];
    this.node.log(`OSC message: '${address}' value: ${value}`);

    var update = this.map[address];
    if (update)
      update(value);
  });

  this.oscPort.on("error", (err) => {
    this.node.log("OSC port error: ", err);
  });

  this.oscPort.open();
}

oscServer.prototype.close = function() {
  this.node.log("Closing OSC");
  this.oscPort.close();
}

module.exports = function (RED) {
  function Mix (config) {
    RED.nodes.createNode(this, config);
    TransValve.call(this, RED, config);

    var mixVal = +config.mix;

    var controlMap = { [config.mixControl]: val => mixVal = val };
    var oscServ = new oscServer(+config.oscPort, this, controlMap);

    var stamper = new codecadon.Stamper(function() {
      console.log('Stamper exiting');
    });
    stamper.on('error', function(err) {
      console.log('Stamper error: ' + err);
    });

    this.setInfo = function (srcTags, dstTags) {
      return stamper.setInfo(srcTags, dstTags);
    }

    this.processGrain = function (srcBufArray, dstBuf, cb) {
      this.log(`Mix: ${mixVal}`);
      var paramTags = { pressure: mixVal };
      var numQueued = stamper.mix(srcBufArray, dstBuf, paramTags, (err, result) => {
        cb(err, result);
      });
    }

    this.quit = function(cb) {
      stamper.quit(() => {
        cb();
        oscServ.close();
      });
    }
  }
  util.inherits(Mix, TransValve);
  RED.nodes.registerType("mix", Mix);
}
