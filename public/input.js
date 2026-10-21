export function bindChatInput(form,input,onSubmit,{clock=()=>performance.now()}={}){
 let composing=false,endedAt=-Infinity;
 input.addEventListener('compositionstart',()=>{composing=true;});
 input.addEventListener('compositionend',()=>{composing=false;endedAt=clock();});
 const blocked=e=>composing||e.isComposing||e.keyCode===229||clock()-endedAt<100;
 input.addEventListener('keydown',e=>{
  // Plain Enter is left to the textarea, including Japanese IME confirmation.
  if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!blocked(e)){e.preventDefault();onSubmit(input.value);}
 });
 form.addEventListener('submit',e=>{e.preventDefault();if(!blocked(e))onSubmit(input.value);});
}
