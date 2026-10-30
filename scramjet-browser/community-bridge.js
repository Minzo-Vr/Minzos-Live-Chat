// Receives navigation requests from the Community Chat browser address bar.
window.addEventListener("message", event => {
  if(event.origin!=="https://minzo-vr.github.io")return;
  if(event.data?.type!=="community-browser-navigate")return;
  const query=event.data.query;
  if(typeof query!=="string"||!query.trim()||query.length>2000)return;
  const input=document.getElementById("sj-address");
  const form=document.getElementById("sj-form");
  if(!input||!form)return;
  input.value=query.trim();
  form.requestSubmit();
});
