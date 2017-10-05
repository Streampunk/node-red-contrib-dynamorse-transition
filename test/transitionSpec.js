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

var TestUtil = require('dynamorse-test').TestUtil;

var mixTestNode = JSON.stringify({
  'type': 'mix',
  'z': TestUtil.testFlowId,
  'name': 'mix-test',
  'x': 100.0,
  'y': 100.0,
  'mix': '0.5',
  'wires': [[]]
});

var funnel1NodeId = '24fde3d7.b7544c';
var funnel2NodeId = 'ba156ff1.45ea9';
var mixNodeId = '145f639d.4b63ac';
var spoutNodeId = 'f2186999.7e5f78';

TestUtil.nodeRedTest('A srcx2->mix->spout flow is posted to Node-RED', {
  numPushes: 10,
  funnelMaxBuffer: 10,
  mixPressure: '0.5',
  spoutTimeout: 0
}, (params) => {
  var testFlow = JSON.parse(TestUtil.testNodes.baseTestFlow);
  testFlow.nodes[0] = JSON.parse(TestUtil.testNodes.funnelGrainNode);
  testFlow.nodes[0].id = funnel1NodeId;
  testFlow.nodes[0].numPushes = params.numPushes;
  testFlow.nodes[0].maxBuffer = params.funnelMaxBuffer;
  testFlow.nodes[0].y = 100.0;
  testFlow.nodes[0].wires[0][0] = mixNodeId;

  testFlow.nodes[1] = JSON.parse(TestUtil.testNodes.funnelGrainNode);
  testFlow.nodes[1].id = funnel2NodeId;
  testFlow.nodes[1].numPushes = params.numPushes;
  testFlow.nodes[1].maxBuffer = params.funnelMaxBuffer;
  testFlow.nodes[1].y = 200.0;
  testFlow.nodes[1].wires[0][0] = mixNodeId;

  testFlow.nodes[2] = JSON.parse(mixTestNode);
  testFlow.nodes[2].id = mixNodeId;
  testFlow.nodes[2].mix = params.mixPressure;
  testFlow.nodes[2].x = 300.0;
  testFlow.nodes[2].wires[0][0] = spoutNodeId;

  testFlow.nodes[3] = JSON.parse(TestUtil.testNodes.spoutTestNode);
  testFlow.nodes[3].id = spoutNodeId;
  testFlow.nodes[3].timeout = params.spoutTimeout;
  testFlow.nodes[3].x = 500.0;
  return testFlow;
}, (t, params, msgObj, onEnd) => {
  //t.comment(`Message: ${JSON.stringify(msgObj)}`);
  if (msgObj.hasOwnProperty('receive')) {
    TestUtil.checkGrain(t, msgObj.receive);
    params.count++;
  }
  else if (msgObj.hasOwnProperty('end') && (msgObj.src === 'spout')) {
    t.equal(params.count, params.numPushes, 'received end after expected number of pushes');
    onEnd();
  }
});
