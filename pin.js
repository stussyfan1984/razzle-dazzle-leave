'use strict';
(() => {
  const endpoint='https://script.google.com/macros/s/AKfycbwdCO0HQegU7WFsdYe7zpo4KZtwLO_xY_26Mac2tTqK-cac0EZCshxrkq5Y-emVSq6I/exec';
  const $=id=>document.getElementById(id);let token='',busy=false;
  const validToken=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{32,256}$/.test(value);
  function message(text,error=false){$('status').textContent=text;$('status').className='notice'+(error?' error':'');$('status').setAttribute('role',error?'alert':'status');}
  function setBusy(value){busy=value;document.querySelectorAll('button,input,textarea').forEach(n=>n.disabled=value);}
  function fragmentToken(fragment){const values=new URLSearchParams(String(fragment).replace(/^#/,'' )).getAll('token');return values.length===1&&validToken(values[0])?values[0]:'';}
  function copiedToken(value){
    let url;try{url=new URL(value.trim());}catch(_){return '';}
    // Outlook may wrap a link. Unwrap only its own HTTPS protection host, once.
    if(url.protocol==='https:'&&/^[a-z0-9.-]+\.safelinks\.protection\.outlook\.com$/.test(url.hostname)){
      try{url=new URL(url.searchParams.get('url')||'');}catch(_){return '';}
    }
    const known=url.protocol==='https:'&&(url.origin+url.pathname===endpoint||url.origin+url.pathname==='https://stussyfan1984.github.io/razzle-dazzle-leave/pin.html');
    return known?fragmentToken(url.hash):'';
  }
  async function api(action,extra={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),55000);
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},credentials:'omit',redirect:'follow',referrerPolicy:'no-referrer',body:JSON.stringify({action,token,...extra}),signal:controller.signal});
      if(!response.ok)throw new Error('服務暫時無法連線，請稍後重試。');
      let data;try{data=await response.json();}catch(_){throw new Error('啟用服務暫時無法回應，請稍後重試。');}
      if(!data||data.ok!==true)throw new Error(data&&data.message||'啟用尚未完成，請稍後重試。');return data;
    }catch(error){if(error.name==='AbortError')throw new Error('等待逾時，結果尚未確認。若已送出 PIN，請使用剛才相同的 PIN 重試。');throw error;}
    finally{clearTimeout(timer);}
  }
  function completed(){$('pin-form').hidden=true;$('link-form').hidden=true;$('pin').value='';$('pin-again').value='';token='';message('PIN 已設定完成。請到店內的打卡電腦，使用這組 PIN 打卡。');}
  async function loadInfo(){
    setBusy(true);message('正在確認你的啟用資料…');$('pin-form').hidden=true;
    try{
      const data=await api('pin_activation_info');
      if(data.status==='ACTIVE'){completed();return;}
      if(!['READY','ACTIVATING'].includes(data.status)||!data.employee||typeof data.employee.name!=='string'||typeof data.employee.id!=='string')throw new Error('到職資料尚未完成確認，請聯絡主管。');
      $('employee').textContent=data.employee.name+'（員工編號 '+data.employee.id+'）';
      const expires=new Date(data.expires_at);$('expiry').textContent=Number.isFinite(expires.getTime())?'連結有效至 '+expires.toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'';
      $('pin-form').hidden=false;$('link-form').hidden=true;
      message(data.status==='ACTIVATING'?'上次設定尚未確認，請輸入上次相同的 PIN 繼續。':'請設定兩次相同的 4 位數字 PIN。');
    }catch(error){message(error.message,true);$('link-form').hidden=false;}finally{setBusy(false);}
  }
  $('link-form').addEventListener('submit',event=>{
    event.preventDefault();if(busy)return;const next=copiedToken($('activation-link').value);$('activation-link').value='';
    if(!next){message('請貼上通知信中完整的打卡 PIN 啟用連結。',true);return;}token=next;loadInfo();
  });
  $('pin-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const pin=$('pin').value,pin2=$('pin-again').value;
    if(!validToken(token)){message('啟用連結已失效，請重新從通知信開啟。',true);return;}
    if(!/^[0-9]{4}$/.test(pin)||pin!==pin2){message('請輸入兩次相同的 4 位數字 PIN。',true);return;}
    setBusy(true);message('正在儲存 PIN 並啟用帳號…');
    try{const data=await api('pin_activate',{pin,pin2});if(data.status!=='ACTIVE')throw new Error('設定結果尚未確認，請使用相同 PIN 重試。');completed();}
    catch(error){message(error.message,true);}finally{setBusy(false);}
  });
  window.addEventListener('pagehide',()=>{token='';$('pin').value='';$('pin-again').value='';$('activation-link').value='';$('pin-form').hidden=true;$('link-form').hidden=false;});
  token=fragmentToken(location.hash);
  if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  if(token)loadInfo();else $('link-form').hidden=false;
})();
