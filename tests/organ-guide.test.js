import test from "node:test";
import assert from "node:assert/strict";
import { heldOrgan, teachingContext, ORGAN_GUIDE } from "../src/organ-guide.js";

test("only a held detached frog organ opens the study", () => {
  const state = {specimen:"frog", held:"heart", pieces:{heart:{detached:true}}};
  assert.equal(heldOrgan(state),"heart");
  assert.equal(heldOrgan({...state,held:null}),null);
  assert.equal(heldOrgan({...state,specimen:"onion"}),null);
  assert.equal(heldOrgan({...state,pieces:{heart:{detached:false}}}),null);
  assert.equal(heldOrgan({...state,held:"abdomen",pieces:{abdomen:{detached:true}}}),null);
  for (const id of Object.keys(ORGAN_GUIDE))
    assert.equal(heldOrgan({...state,held:id,pieces:{[id]:{detached:true}}}),id);
});

test("teaching context is a coarse allowlist, never a debug or camera dump", () => {
  const state = {specimen:"frog",tool:"hand",cutOpen:true,held:"liver",selected:"liver",
    pieces:{liver:{detached:true,position:[1,2,3]},abdomen:{detached:true},body:{detached:false}},
    available:[{id:"stomach",label:"untrusted label"}],landmarks:["private"],apiKey:"private",url:"private"};
  const before = structuredClone(state);
  assert.deepEqual(teachingContext(state),{specimen:"frog",tool:"hand",incision:"open",held:"Liver",selected:"Liver",
    removed:["Liver","Abdominal panel"],available:["Stomach"]});
  assert.deepEqual(state,before);
  assert.equal(teachingContext({...state,cutOpen:false,cut:.4}).incision,"partial");
  assert.equal(teachingContext({...state,cutOpen:false,cut:0}).incision,"intact");
});
