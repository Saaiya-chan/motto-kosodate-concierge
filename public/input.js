export function bindChatInput(form,input,onSubmit,{clock=()=>performance.now()}={}){
 let composing=false,endedAt=-Infinity;
 input.addEventListener('compositionstart',()=>{composing=true;});
 input.addEventListener('compositionend',()=>{composing=false;endedAt=clock();});
 const blocked=e=>composing||e.isComposing||e.keyCode===229||clock()-endedAt<100;
 input.addEventListener('keydown',e=>{
  if(e.key!=='Enter'||e.shiftKey)return;
  if(blocked(e))return;
  e.preventDefault();if(!e.repeat)onSubmit(input.value);
 });
 form.addEventListener('submit',e=>{e.preventDefault();if(!blocked(e))onSubmit(input.value);});
}
