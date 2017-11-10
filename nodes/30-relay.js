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

const util = require('util');
const TransValve = require('./transValve.js').TransValve;
const oscServer = require('../util/oscServer.js');

module.exports = function (RED) {
  function Relay (config) {
    RED.nodes.createNode(this, config);
    TransValve.call(this, RED, config);

    const numInputs = 2;
    this.active = (config.active === null || typeof config.active === 'undefined') || config.active;
    const node = this;

    const oscServ = oscServer.getInstance(this);
    oscServ.addControl(config.actControl, val => this.active = val != 0);

    this.getProcessSources = cable => cable.filter((c, i) => i < numInputs);
    
    this.setInfo = (/*srcTags, dstTags, logLevel*/) => { };

    this.processGrain = (flowType, srcBufArray, cb) => {
      cb(null, srcBufArray[node.active?1:0]);
    };

    this.quit = cb => cb();

    this.closeValve = done => {
      oscServ.removeControl(config.actControl);
      this.close(done);
    };
  }

  util.inherits(Relay, TransValve);
  RED.nodes.registerType('relay', Relay);

  RED.httpAdmin.post('/relay/:id/:state', RED.auth.needsPermission('relay.write'), (req, res) => {
    const node = RED.nodes.getNode(req.params.id);
    const state = req.params.state;
    if (node !== null && typeof node !== 'undefined' ) {
      if (state === 'enable') {
        node.active = true;
        res.sendStatus(200);
      } else if (state === 'disable') {
        node.active = false;
        res.sendStatus(201);
      } else {
        res.sendStatus(404);
      }
    } else {
      res.sendStatus(404);
    }
  });
};
