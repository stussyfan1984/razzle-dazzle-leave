'use strict';
(() => {
  const ENDPOINT = 'https://script.google.com/macros/s/AKfycbxRaMP48S16xmZGdvPxNm2YIH_pO1rebHh_tqnngD4XWPC-9Vq39NlQ8kupKuuiKV3W/exec';
  const $ = id => document.getElementById(id);
  const ROLE_LABELS = {onboarding:'管理新人到職',payslip_publish:'發布員工薪資單',owner:'管理主管帳號'};
  const listeners = [];
  let session = null, linkToken = '', linkMode = '', pending = false, generation = 0;
  const node = (tag,text,className) => {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
  function status(text,error=false){const target=$('ma-auth').hidden?$('message'):$('ma-message');target.replaceChildren(node('div',text,'notice'+(error?' error':'')));}
  function notify(){listeners.forEach(fn=>fn(session?session.user:null));}
  function clearSession(){generation++;session=null;$('ma-accounts').replaceChildren();$('ma-owner-tools').hidden=true;$('ma-auth').hidden=false;$('login').hidden=false;notify();}
  function roles(user){return user.roles.map(role=>ROLE_LABELS[role]).join('、');}
  function validateUser(user){
    if(!user||typeof user.id!=='string'||!user.id||typeof user.name!=='string'||!user.name||typeof user.email!=='string'||!Array.isArray(user.roles)||!user.roles.includes('onboarding')||!user.roles.includes('payslip_publish')||user.roles.some(r=>!Object.hasOwn(ROLE_LABELS,r)))throw new Error('帳號權限不符，請由店主重新確認授權。');
    return {id:user.id,name:user.name,email:user.email,roles:[...user.roles],canonical_operator:user.canonical_operator||user.name};
  }
  async function request(action,extra={},authenticated=false){
    if(authenticated&&!session){clearSession();throw new Error('登入已到期，請重新登入。');}
    const requestGeneration=generation;
    const timerController=new AbortController(), timer=setTimeout(()=>timerController.abort(),55000);
    try{
      const payload={...extra,action};
      if(authenticated)payload.ma_session_token=session.session_token;
      const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),credentials:'omit',redirect:'follow',referrerPolicy:'no-referrer',signal:timerController.signal});
      if(!response.ok)throw new Error('暫時無法連線，請稍後再試。');
      const result=await response.json();
      if(requestGeneration!==generation)throw new Error('登入狀態已變更，請重新登入後繼續。');
      if(!result.success){const error=new Error(result.error||'操作未完成，請稍後再試。');error.code=result.code;if(authenticated&&/SESSION|REVOKED|DISABLED/.test(String(result.code||'')))clearSession();throw error;}
      return result.data;
    }catch(error){if(error.name==='AbortError')throw new Error('等待逾時，操作可能已完成。請重新查看狀態；請勿重複提交。');throw error;}finally{clearTimeout(timer);}
  }
  function password(value,repeat){
    if([...value].length<15||new TextEncoder().encode(value).length>72)throw new Error('密碼至少 15 個字元，最多 72 個 UTF-8 位元組；建議使用容易記住的長句。');
    if(value!==repeat)throw new Error('兩次輸入的密碼不一致。');
    return value;
  }
  function switchMode(mode){
    ['login','register','forgot','resend','verify','approve','reset'].forEach(name=>{$('ma-'+name).hidden=name!==mode;});
    ['login','register'].forEach(name=>{$('ma-tab-'+name).setAttribute('aria-pressed',String(name===mode));});
    $('ma-message').replaceChildren();
  }
  async function work(fn){
    if(pending)return;pending=true;
    const fields=[...$('ma-auth').querySelectorAll('button,input'),...$('ma-owner-tools').querySelectorAll('button,input')];
    fields.forEach(n=>{n.dataset.maWasDisabled=String(n.disabled);n.disabled=true;});
    try{await fn();}catch(error){status(error.message,true);}finally{pending=false;fields.forEach(n=>{n.disabled=n.dataset.maWasDisabled==='true';delete n.dataset.maWasDisabled;});}
  }
  function clearPasswords(){['ma-login-password','ma-register-password','ma-register-repeat','ma-reset-password','ma-reset-repeat','ma-resend-password'].forEach(id=>{$(id).value='';});}
  function accountDetails(account){
    const list=node('dl',undefined,'details-list');
    [['姓名',account.name],['Email',account.email],['申請權限',roles(account)]].forEach(([label,value])=>list.append(node('dt',label),node('dd',value)));
    return list;
  }
  async function approvalInfo(){
    if(!linkToken)throw new Error('請重新開啟信中的審核連結。');
    const data=await request('ma_approval_info',{token:linkToken});
    const account=validateUser(data.account);$('ma-approval-details').replaceChildren(accountDetails(account));
    if(data.decision){$('ma-approval-actions').hidden=true;status('這份申請已處理：'+({APPROVED:'已同意',REJECTED:'已拒絕',approved:'已同意',rejected:'已拒絕'}[data.decision]||data.decision));}
    else{$('ma-approval-actions').hidden=false;}
  }
  async function decide(action){
    if(!linkToken||linkMode!=='approve')throw new Error('請重新開啟信中的審核連結。');
    const response=await request(action,{token:linkToken});
    $('ma-approval-actions').hidden=true;$('ma-approval-refresh').hidden=true;linkToken='';status(response.message||(action==='ma_approve'?'已同意申請，申請者可以登入。':'已拒絕申請，帳號未取得權限。'));
  }
  async function loadAccounts(){
    const data=await request('ma_list_accounts',{},true);$('ma-accounts').replaceChildren();
    const accounts=data.accounts||[];
    if(!accounts.length)$('ma-accounts').append(node('p','目前沒有主管帳號。','hint'));
    accounts.forEach(account=>{
      const item=node('div',undefined,'account-item');item.append(node('strong',account.name),node('p',account.email),node('p','狀態：'+({ACTIVE:'可登入',APPROVED:'可登入',PENDING_APPROVAL:'待店主同意',PENDING_EMAIL:'待驗證信箱',REVOKED:'已撤銷',REJECTED:'已拒絕'}[account.status]||account.status)));
      if(account.last_mail){const mail=account.last_mail;item.append(node('p','通知信：'+({SENT:'已寄送',INTENT:'寄送結果尚待確認',UNKNOWN:'寄送結果不明，請先確認信箱',QUOTA_BLOCKED:'寄信額度暫時用完'}[mail.status]||'寄送狀態待確認'),'hint'));}
      if(account.status==='PENDING_APPROVAL'){
        ['ma_approve','ma_reject'].forEach(action=>{const approve=action==='ma_approve',button=node('button',approve?'同意授權':'拒絕申請',approve?'':'secondary');button.addEventListener('click',()=>work(async()=>{if(!window.confirm((approve?'同意':'拒絕')+' '+account.name+'（'+account.email+'）的申請？權限包含管理新人到職與發布員工薪資單。'))return;await request(action,{account_id:account.id},true);await loadAccounts();status(approve?'已同意申請，操作已記錄。':'已拒絕申請，操作已記錄。');}));item.append(button);});
      }
      if(account.id!==session.user.id&&!['REVOKED','REJECTED'].includes(account.status)){
        const button=node('button','撤銷權限','secondary');button.addEventListener('click',()=>work(async()=>{
          if(!window.confirm('撤銷 '+account.name+'（'+account.email+'）的權限？對方已登入的工作階段也會失效。'))return;
          await request('ma_revoke',{account_id:account.id},true);await loadAccounts();status('權限已撤銷，操作已記錄。');
        }));item.append(button);
      }
      $('ma-accounts').append(item);
    });
  }
  $('ma-tab-login').addEventListener('click',()=>switchMode('login'));
  $('ma-tab-register').addEventListener('click',()=>switchMode('register'));
  $('ma-forgot-link').addEventListener('click',()=>switchMode('forgot'));
  $('ma-resend-link').addEventListener('click',()=>switchMode('resend'));
  $('ma-resend-back').addEventListener('click',()=>switchMode('login'));
  $('ma-resend-form').addEventListener('submit',event=>{event.preventDefault();work(async()=>{const secret=$('ma-resend-password').value;$('ma-resend-password').value='';const result=await request('ma_resend_verification',{email:$('ma-resend-email').value.trim(),password:secret});status(result.message||'若資料符合尚待驗證的申請，將寄出新的驗證信，原連結會失效。');});});
  $('ma-back-login').addEventListener('click',()=>switchMode('login'));
  $('ma-login-form').addEventListener('submit',event=>{event.preventDefault();work(async()=>{
    const secret=$('ma-login-password').value;$('ma-login-password').value='';
    const result=await request('ma_login',{email:$('ma-login-email').value.trim(),password:secret});
    const user=validateUser(result.user);
    if(typeof result.session_token!=='string'||!result.session_token||!Number.isFinite(Date.parse(result.expires_at))||Date.parse(result.expires_at)<=Date.now())throw new Error('登入結果不完整，請重新登入。');
    session={session_token:result.session_token,expires_at:result.expires_at,user};
    clearPasswords();$('ma-auth').hidden=true;$('login').hidden=true;$('ma-owner-tools').hidden=!user.roles.includes('owner');notify();
  });});
  $('ma-register-form').addEventListener('submit',event=>{event.preventDefault();work(async()=>{
    const secret=password($('ma-register-password').value,$('ma-register-repeat').value),name=$('ma-register-name').value.trim(),email=$('ma-register-email').value.trim();
    if(!name)throw new Error('請填寫實際操作人姓名。');
    $('ma-register-password').value='';$('ma-register-repeat').value='';
    const result=await request('ma_register',{name,email,password:secret});status(result.message||'請查看信箱並驗證 Email；驗證後會寄信請店主同意。');
  });});
  $('ma-forgot-form').addEventListener('submit',event=>{event.preventDefault();work(async()=>{const result=await request('ma_forgot_password',{email:$('ma-forgot-email').value.trim()});status(result.message||'若此信箱有符合條件的帳號，將收到重設密碼信。');});});
  $('ma-verify-button').addEventListener('click',()=>work(async()=>{
    if(!linkToken||linkMode!=='verify')throw new Error('請重新開啟驗證信中的連結。');
    const result=await request('ma_verify_email',{token:linkToken});linkToken='';$('ma-verify-button').hidden=true;status(result.message||'Email 已驗證，申請已送交店主審核。店主同意後即可登入。');
  }));
  $('ma-approval-refresh').addEventListener('click',()=>work(approvalInfo));
  $('ma-approve-button').addEventListener('click',()=>work(()=>decide('ma_approve')));
  $('ma-reject-button').addEventListener('click',()=>work(async()=>{if(window.confirm('確定拒絕這份主管權限申請？'))await decide('ma_reject');}));
  $('ma-reset-form').addEventListener('submit',event=>{event.preventDefault();work(async()=>{
    if(!linkToken||linkMode!=='reset')throw new Error('請重新開啟重設密碼信中的連結。');
    const secret=password($('ma-reset-password').value,$('ma-reset-repeat').value);$('ma-reset-password').value='';$('ma-reset-repeat').value='';
    const result=await request('ma_reset_password',{token:linkToken,password:secret});linkToken='';switchMode('login');status(result.message||'密碼已更新，請使用新密碼登入。');
  });});
  $('ma-load-accounts').addEventListener('click',()=>work(loadAccounts));
  window.RzdManagerAuth={
    hasSession:()=>!!session,
    user:()=>session?{...session.user,roles:[...session.user.roles]}:null,
    onSession:fn=>{listeners.push(fn);if(session)fn(session.user);},
    request:(action,extra)=>request(action,extra,true),
    logout:async()=>{const oldToken=session?session.session_token:'';clearSession();clearPasswords();switchMode('login');if(oldToken)await request('ma_logout',{ma_session_token:oldToken});},
    showLogin:()=>{$('ma-auth').hidden=false;switchMode('login');}
  };
  window.addEventListener('pagehide',()=>{linkToken='';clearSession();clearPasswords();switchMode('login');});
  const fragment=new URLSearchParams(location.hash.slice(1));
  const links=['verify','approve','reset'].filter(mode=>fragment.has(mode));
  if(links.length){
    // Remove email capabilities before any API request or user navigation. Never persist them.
    history.replaceState(null,'',location.pathname+location.search);
    if(links.length!==1||!fragment.get(links[0])){switchMode('login');status('連結格式不完整，請重新開啟信件中的連結。',true);}
    else{linkMode=links[0];linkToken=fragment.get(linkMode);switchMode(linkMode);if(linkMode==='approve')work(approvalInfo);}
  }
})();
