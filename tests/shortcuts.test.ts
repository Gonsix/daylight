import * as i18n from '../src/i18n';
i18n.setLanguage('ja');
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TargetedKeyboardEvent } from 'preact';
import { confirmRangeOnEnter, submitOnCommandEnter } from '../src/shortcuts';

function fixture(patch:Record<string,unknown>={},disabled=false) {
  let submissions=0,prevented=false,stopped=false;
  const button={disabled,matches:()=>disabled};
  const event={key:'Enter',metaKey:true,ctrlKey:false,altKey:false,shiftKey:false,repeat:false,keyCode:13,defaultPrevented:false,
    nativeEvent:{isComposing:false},currentTarget:{querySelector:()=>button,requestSubmit:(submit:unknown)=>{assert.equal(submit,button);submissions++;}},
    preventDefault:()=>{prevented=true;},stopPropagation:()=>{stopped=true;},...patch} as unknown as TargetedKeyboardEvent<HTMLFormElement>;
  return {event,result:()=>({submissions,prevented,stopped})};
}
test('Command+Enter/Return submit the focused form through requestSubmit',()=>{
  for(const key of ['Enter','Return']){const {event,result}=fixture({key});submitOnCommandEnter(event);assert.deepEqual(result(),{submissions:1,prevented:true,stopped:true});}
});
test('plain Return remains available for textarea newlines',()=>{
  const {event,result}=fixture({metaKey:false});submitOnCommandEnter(event);assert.deepEqual(result(),{submissions:0,prevented:false,stopped:false});
});
test('Japanese IME composition and keycode 229 do not trigger a save',()=>{
  for(const patch of [{isComposing:true},{nativeEvent:{isComposing:true}},{keyCode:229}]){const {event,result}=fixture(patch);submitOnCommandEnter(event);assert.equal(result().submissions,0);assert.equal(result().prevented,false);}
});
test('busy or disabled submit actions do not save or activate other app commands',()=>{
  const busy=fixture();submitOnCommandEnter(busy.event,true);assert.deepEqual(busy.result(),{submissions:0,prevented:true,stopped:true});
  const disabled=fixture({},true);submitOnCommandEnter(disabled.event);assert.equal(disabled.result().submissions,0);
});
test('key repeats and other modifier combinations do not trigger saves',()=>{
  for(const patch of [{repeat:true},{altKey:true},{ctrlKey:true},{shiftKey:true},{key:'Escape'}]){const {event,result}=fixture(patch);submitOnCommandEnter(event);assert.equal(result().submissions,0);}
});
test('plain Enter/Return confirm a selected timeline range without a button click',()=>{
  for(const key of ['Enter','Return']){
    const f=fixture({key,metaKey:false,target:{closest:()=>null}});let confirmed=0;
    confirmRangeOnEnter(f.event as unknown as TargetedKeyboardEvent<HTMLDivElement>,()=>confirmed++);
    assert.equal(confirmed,1);assert.equal(f.result().prevented,true);
  }
});
test('range confirmation ignores typing, cancellation controls, existing events, IME and held keys',()=>{
  for(const patch of [{target:{closest:()=>({})}},{nativeEvent:{isComposing:true}},{keyCode:229},{repeat:true},{metaKey:true}]){
    const f=fixture({metaKey:false,target:{closest:()=>null},...patch});let confirmed=0;
    confirmRangeOnEnter(f.event as unknown as TargetedKeyboardEvent<HTMLDivElement>,()=>confirmed++);
    assert.equal(confirmed,0);assert.equal(f.result().prevented,false);
  }
  const f=fixture({metaKey:false,target:{closest:()=>null}});let confirmed=0;
  confirmRangeOnEnter(f.event as unknown as TargetedKeyboardEvent<HTMLDivElement>,()=>confirmed++,true);assert.equal(confirmed,0);
});
