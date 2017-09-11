/* Copyright 2016 Streampunk Media Ltd.

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
var oscServer = require('../util/oscServer.js');

module.exports = function (RED) {
  function Relay (config) {
    RED.nodes.createNode(this, config);
    TransValve.call(this, RED, config);
    this.active = (config.active === null || typeof config.active === "undefined") || config.active;
    var node = this;

    var oscServ = oscServer.getInstance(this);
    oscServ.addControl(config.actControl, val => this.active = val != 0);

    this.setInfo = function (srcTags, dstTags) {
      return 0;
    }

    this.processGrain = function (srcBufArray, dstBufLen, cb) {
      cb(null, srcBufArray[node.active?1:0]);
    }

    this.quit = function(cb) {
      cb();
    }

    this.close = function() {
      oscServ.removeControl(config.actControl);
    }
  }
  util.inherits(Relay, TransValve);
  RED.nodes.registerType("relay", Relay);

  RED.httpAdmin.post("/relay/:id/:state", RED.auth.needsPermission("relay.write"), function(req,res) {
    var node = RED.nodes.getNode(req.params.id);
    var state = req.params.state;
    if (node !== null && typeof node !== "undefined" ) {
      if (state === "enable") {
        node.active = true;
        res.sendStatus(200);
      } else if (state === "disable") {
        node.active = false;
        res.sendStatus(201);
      } else {
        res.sendStatus(404);
      }
    } else {
      res.sendStatus(404);
    }
  });
}
