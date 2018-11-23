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

const util = require('util');
const TransValve = require('./transValve.js').TransValve;
const codecadon = require('codecadon');

module.exports = function (RED) {
  function Stamp (config) {
    RED.nodes.createNode(this, config);
    TransValve.call(this, RED, config);

    const numInputs = 2;
    let dstBufLen = 0;
    
    const stamper = new codecadon.Stamper(() => this.log('Stamper exiting'));
    stamper.on('error', err => this.error('Stamper error: ' + err));

    this.getProcessSources = cable => {
      let srcCable = cable.filter((c, i) => i < numInputs);

      const alphas = [];
      srcCable.forEach(c => {
        if (c.video && Array.isArray(c.video)) {
          const f = c.video[0];
          let hasAlpha = f.tags.hasAlpha || false;
          if (f.tags.hasAlpha && Array.isArray(f.tags.hasAlpha))
            hasAlpha = ('true' === f.tags.hasAlpha[0]) || ('1' === f.tags.hasAlpha[0]);
          alphas.push(hasAlpha);
        }
      });

      if (!alphas[0] && !alphas[1])
        throw new Error(`${config.type}: no alpha channel found on source video flows`);

      if (!alphas[0] && alphas[1])
        srcCable = srcCable.reverse(); // flow with alpha must be processed first

      return srcCable;
    };
    
    this.setInfo = (srcTags, dstTags, logLevel) => {
      const srcVideoTags = srcTags.filter(t => t.format === 'video');
      dstBufLen = stamper.setInfo(srcVideoTags, dstTags.video, logLevel);
    };

    this.processGrain = (flowType, srcBufArray, cb) => {
      if ('video' === flowType) {
        const dstBuf = Buffer.alloc(dstBufLen);
        const paramTags = {};
        stamper.stamp(srcBufArray, dstBuf, paramTags, (err, result) => {
          cb(err, result);
        });
      } else {
        cb(null, srcBufArray[0]);
      }
    };

    this.quit = cb => {
      stamper.quit(() => cb());
    };

    this.closeValve = () => {};
  }
  util.inherits(Stamp, TransValve);
  RED.nodes.registerType('stamp', Stamp);
};
