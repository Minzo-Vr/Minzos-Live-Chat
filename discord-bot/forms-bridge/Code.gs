/**
 * Community Hub /applications -> Google Forms bridge.
 *
 * Deploy as a Google Apps Script Web App:
 *   Execute as: Me (Google account that can edit both application forms)
 *   Who has access: Anyone
 *
 * REQUIRED Script Properties (Project Settings -> Script properties):
 *   APPLICATIONS_BRIDGE_SECRET  a unique random shared secret (at least 32 chars)
 *   MODERATOR_FORM_ID          Google Forms edit URL's /d/<ID>/ value
 *   TEST_SUBJECTS_FORM_ID      Google Forms edit URL's /d/<ID>/ value
 *
 * In the Cloudflare Discord Worker, create matching secret bindings:
 *   APPLICATIONS_WEBHOOK_URL    the Apps Script Web App /exec URL
 *   APPLICATIONS_WEBHOOK_SECRET same secret as APPLICATIONS_BRIDGE_SECRET
 *
 * The public Web App URL grants NO access without a signed, fresh request.
 * Never place the shared secret in the public GitHub repository.
 */
function doGet() {
  return output_({ok:false,error:'This endpoint only accepts signed application changes.'});
}
function output_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
function sameHex_(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  var difference=0;
  for(var i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
  return difference===0;
}
function hmacHex_(message,secret){
  return Utilities.computeHmacSha256Signature(message,secret)
    .map(function(value){return ('0'+(value&255).toString(16)).slice(-2);}).join('');
}
function doPost(e){
  var lock=null;
  try{
    var raw=e&&e.postData&&e.postData.contents;
    if(!raw||raw.length>2048)throw Error('Invalid request.');
    var request=JSON.parse(raw);
    var type=request.type,status=request.status;
    if(type!=='moderator'&&type!=='test_subjects')throw Error('Invalid application type.');
    if(status!=='open'&&status!=='closed')throw Error('Invalid status.');
    var ts=Number(request.ts),nonce=String(request.nonce||'');
    if(!Number.isSafeInteger(ts)||Math.abs(Date.now()-ts)>120000)throw Error('Expired request.');
    if(!/^[a-f0-9-]{36}$/i.test(nonce))throw Error('Invalid request ID.');
    var properties=PropertiesService.getScriptProperties();
    var secret=properties.getProperty('APPLICATIONS_BRIDGE_SECRET');
    if(!secret||secret.length<32)throw Error('Bridge secret not configured.');
    var canonical=ts+'.'+nonce+'.'+type+'.'+status;
    var expected=hmacHex_(canonical,secret);
    if(!sameHex_(String(request.signature||'').toLowerCase(),expected))
      throw Error('Unauthorized request.');

    // Guard both against simultaneous requests and replaying a signed request.
    lock=LockService.getScriptLock();
    if(!lock.tryLock(10000))throw Error('Form is busy. Retry shortly.');
    var cache=CacheService.getScriptCache();
    var cacheKey='application-request:'+nonce;
    if(cache.get(cacheKey))throw Error('Repeated request.');
    cache.put(cacheKey,'used',180);

    var property=type==='moderator'?'MODERATOR_FORM_ID':'TEST_SUBJECTS_FORM_ID';
    var id=properties.getProperty(property);
    if(!id||!/^[A-Za-z0-9_-]{15,200}$/.test(id))throw Error('Form ID not configured.');
    var form=FormApp.openById(id);
    var shouldOpen=status==='open';
    if(shouldOpen){
      if(form.supportsAdvancedResponderPermissions()&&!form.isPublished())
        form.setPublished(true);
      form.setAcceptingResponses(true);
    }else{
      form.setCustomClosedFormMessage('Applications are currently closed. Please check our Discord server for the next opening.');
      form.setAcceptingResponses(false);
    }
    var accepting=form.isAcceptingResponses();
    if(accepting!==shouldOpen)throw Error('The form did not confirm its response status.');
    return output_({ok:true,type:type,status:status,acceptingResponses:accepting,formTitle:form.getTitle(),responderUrl:form.getPublishedUrl()});
  }catch(error){
    console.error('Application form bridge error:',String(error));
    return output_({ok:false,error:String(error&&error.message||'Form update failed.')});
  }finally{
    if(lock&&lock.hasLock())lock.releaseLock();
  }
}
