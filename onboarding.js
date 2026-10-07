'use strict';
(() => {
  const ENDPOINT = 'https://script.google.com/macros/s/AKfycbxRaMP48S16xmZGdvPxNm2YIH_pO1rebHh_tqnngD4XWPC-9Vq39NlQ8kupKuuiKV3W/exec';
  const $ = id => document.getElementById(id);
  const labels = {PENDING:'待審核',DRAFT:'待審核',APPROVED:'已核准，待同步',PROVISIONING:'同步中',SYNCING:'同步中',CANCELLED:'已取消',READY:'帳號已建立',BLOCKED:'需要處理',FAILED:'同步未完成'};
  const salaryFields = [
    ['hire_date','到職日期','date'],['employee_type','僱用類型',['正職','兼職']],['salary_type','薪資類型',['月薪','時薪']],['status','在職狀態',['在職','試用期']],
    ['hourly_rate','時薪（元）','number'],['monthly_salary','月薪（元）','number'],['meal_allowance','伙食津貼（元）','number'],
    ['ot1_rate','加班 1 倍率','number'],['ot2_rate','加班 2 倍率','number'],['labor_ins_base','勞保投保金額（元）','number'],['health_ins_base','健保投保金額（元）','number'],['labor_employee','勞保員工負擔（元）','number'],['health_employee','健保員工負擔（元）','number']
  ];
  let credential = '', operator = '', cases = [], selected = null, busy = false, approvalRevision = null, pendingBootstrap = null, mustReload = false;
  const el = (tag,text,className) => { const n = document.createElement(tag); if(text !== undefined)n.textContent=text; if(className)n.className=className; return n; };
  function message(text,error=false){$('message').replaceChildren(text?el('div',text,'notice'+(error?' error':'')):el('span'));}
  function setBusy(value){busy=value;document.querySelectorAll('button').forEach(b=>{if(b.closest&&b.closest('#ma-auth,#ma-owner-tools'))return;b.disabled=value||b.dataset.locked==='true';});document.querySelectorAll('input,select,textarea').forEach(f=>{if(f.closest&&f.closest('#ma-auth,#ma-owner-tools'))return;if(value){f.dataset.wasDisabled=String(f.disabled);f.disabled=true;}else if(f.dataset.wasDisabled!==undefined){f.disabled=f.dataset.wasDisabled==='true';delete f.dataset.wasDisabled;}});}
  function requireReload(){mustReload=true;document.querySelectorAll('button').forEach(b=>{if(b.dataset.mutation==='true'){b.dataset.locked='true';b.disabled=true;}});}
  async function api(action,extra={}){
    const auth=window.RzdManagerAuth, named=auth&&auth.hasSession();
    if(!named&&!credential)throw new Error('請先登入帳號或輸入店主備用金鑰。');
    const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),55000);
    try{
      if(named)return await auth.request(action,extra);
      const result = await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},credentials:'omit',redirect:'follow',referrerPolicy:'no-referrer',body:JSON.stringify({...extra,action,admin_token:credential,operator}),signal:controller.signal});
      if(!result.ok)throw new Error('服務暫時無法連線。請保留同一筆申請，重新讀取結果。');
      const data = await result.json();
      if(!data.success){const err=new Error(data.error||data.message||'操作未完成，請重新讀取同一筆申請。');err.code=data.code;throw err;}
      return data.data;
    }catch(e){if(['hr_admin_save','hr_admin_approve','hr_admin_retry','hr_admin_cancel','hr_admin_reissue'].includes(action)){requireReload();}if(e.name==='AbortError')throw new Error('等待逾時，操作可能已完成。請重新讀取這筆申請後再繼續，避免重複操作。');throw e;}finally{clearTimeout(timer);}
  }
  async function run(work){if(busy)return;setBusy(true);message('');try{await work();}catch(e){message(e.message,true);}finally{setBusy(false);}}
  async function loadList(){const data=await api('hr_admin_list');cases=data.cases||[];renderCases();return data;}
  function renderCases(){
    $('case-count').textContent=cases.length+' 筆申請';$('cases').replaceChildren();
    if(!cases.length)$('cases').append(el('p','目前沒有新的到職申請。','hint'));
    cases.forEach(c=>{const b=el('button',c.name||'待確認姓名','case'+(selected&&selected.case_id===c.case_id?' selected':''));b.append(el('small',labels[c.status]||c.status));b.addEventListener('click',()=>run(()=>loadCase(c.case_id)));$('cases').append(b);});
  }
  async function loadCase(id){const data=await api('hr_admin_detail',{case_id:id});selected=data.case;mustReload=false;renderCases();renderDetail();}
  function detailRow(dl,key,value){dl.append(el('dt',key),el('dd',value==null||value===''?'尚未填寫':String(value)));}
  function renderDetail(){
    const c=selected, root=$('detail');root.replaceChildren();if(!c){root.append(el('p','請選擇一筆申請。'));return;}
    root.append(el('h2',c.name+' · 到職資料'),el('span',labels[c.status]||c.status,'badge'));
    const dl=el('dl',undefined,'details-list');detailRow(dl,'員工編號',c.employee_id||'核准時統一分配');detailRow(dl,'通知信箱',c.email);detailRow(dl,'申請編號',c.case_id);root.append(dl);
    const status=el('div',undefined,'steps');status.textContent=stageText(c);root.append(status);
    const editable=['PENDING','DRAFT'].includes(c.status);
    if(mustReload)root.append(el('p','前次操作結果尚未確認。請按「重新讀取此筆」，取得最新狀態後再繼續。','locked'));
    if(c.issue)root.append(el('p','同步尚未完成，請保留此申請並重試。若持續失敗，請提供錯誤代碼：'+(typeof c.issue==='string'?c.issue:JSON.stringify(c.issue)),'notice error'));
    if(c.reissue_pending)root.append(el('p','啟用連結更新尚未完成，請按「重試同步」完成同一次更新。','notice'));
    if(c.status==='CANCELLED')root.append(el('p','這筆申請已取消，保留紀錄，不建立帳號。','locked'));
    else if(!editable)root.append(el('p','已核准的資料已固定。若同步未完成，請使用「重試同步」，沿用原員工編號。','locked'));
    const form=el('form');form.id='case-form';form.append(el('h3','薪資與任用資料'));const grid=el('div',undefined,'grid');
    salaryFields.forEach(([key,label,type])=>{
      const lab=el('label',label);let field;
      if(Array.isArray(type)){field=el('select');const blank=el('option','請選擇');blank.value='';field.append(blank);type.forEach(v=>{const opt=el('option',v);opt.value=v;field.append(opt);});}
      else {field=el('input');field.type=type;if(type==='number'){field.min=key.startsWith('ot')?'1':'0';field.step='0.01';}}
      field.id='field-'+key;field.name=key;field.disabled=!editable;
      const value = c.salary && c.salary[key] !== undefined ? c.salary[key] : (key==='hire_date'?c.hire_date:undefined);
      if(value!==undefined&&value!==null)field.value=String(value);lab.append(field);grid.append(lab);
    });form.append(grid);
    const note=el('p','金額請依實際約定與投保資料填寫；不適用的金額填 0。','hint');form.append(note);
    const reasonLabel=el('label','儲存／核准原因（必填）');const reason=el('textarea');reason.id='reason';reason.maxLength=500;reasonLabel.append(reason);form.append(reasonLabel);
    const actions=el('div',undefined,'actions');
    if(editable){const save=el('button','儲存草稿','secondary');save.type='button';save.addEventListener('click',()=>run(saveDraft));const approve=el('button','核對並核准');approve.type='button';approve.addEventListener('click',reviewApproval);[save,approve].forEach(b=>{b.dataset.mutation='true';b.dataset.locked=String(mustReload);b.disabled=mustReload;});actions.append(save,approve);const cancel=el('button','取消這筆申請','secondary');cancel.type='button';cancel.dataset.mutation='true';cancel.dataset.locked=String(mustReload);cancel.disabled=mustReload;cancel.addEventListener('click',()=>run(async()=>{const why=readReason();if(!window.confirm('確定取消 '+c.name+' 的這筆到職申請？既有紀錄會保留，且不建立帳號。'))return;const data=await api('hr_admin_cancel',{case_id:c.case_id,expected_revision:c.revision,reason:why});selected=data.case;await loadList();renderDetail();message('申請已取消，紀錄已保留。');}));actions.append(cancel);}
    if(!editable && (c.reissue_pending || !['READY','CANCELLED'].includes(c.status))){const retry=el('button','重試同步');retry.type='button';retry.addEventListener('click',()=>run(async()=>{if(mustReload)throw new Error('請先重新讀取此筆。');const why=readReason();const data=await api('hr_admin_retry',{case_id:c.case_id,expected_revision:c.revision,reason:why});selected=data.case;await loadList();renderDetail();message('已更新同步結果。');}));retry.dataset.mutation='true';retry.dataset.locked=String(mustReload);retry.disabled=mustReload;actions.append(retry);}
    if(c.employee_id && c.status!=='CANCELLED' && !c.reissue_pending){const resend=el('button','重新寄送啟用連結','secondary');resend.type='button';resend.dataset.mutation='true';resend.dataset.locked=String(mustReload);resend.disabled=mustReload;resend.addEventListener('click',()=>run(async()=>{if(mustReload)throw new Error('請先重新讀取此筆。');const why=readReason();if(!window.confirm('重新寄送給 '+c.name+'（'+c.email+'）？原啟用連結將失效，員工編號保持不變。已設定 PIN 的帳號不會重設。'))return;const data=await api('hr_admin_reissue',{case_id:c.case_id,expected_revision:c.revision,reason:why});selected=data.case;await loadList();renderDetail();message('已更新啟用連結處理結果，請查看通知狀態。');}));actions.append(resend);}
    const reload=el('button','重新讀取此筆','secondary');reload.type='button';reload.addEventListener('click',()=>run(()=>loadCase(c.case_id)));actions.append(reload);form.append(actions);form.addEventListener('submit',e=>e.preventDefault());root.append(form);
  }
  function stageText(c){
    const parts=[];if(c.pipeline){Object.entries(c.pipeline).forEach(([k,v])=>{const names={punch:'打卡帳號',leave:'請假帳號',punch_provision:'打卡建檔',punch_ready:'打卡啟用準備',leave_ready:'請假帳號',leave_pending:'請假建檔',master:'員工主檔'};if(typeof v==='string'||typeof v==='boolean')parts.push((names[k]||k)+'：'+(typeof v==='boolean'?(v?'完成':'待完成'):String(v)));});}
    const mail=c.welcome_mail||c.mail||c.welcome;if(mail){const s=typeof mail==='string'?mail:(mail.status||mail.welcome_status);if(s)parts.push('啟用通知：'+({SENT:'已寄送',NONE:'尚未寄送',DISABLED:'尚未啟用寄信',UNKNOWN:'寄送結果未確認，請主管確認信件後處理',SENDING:'寄送中',PENDING:'待寄送'}[s]||s));}
    return parts.join('\n')||'核准前不會建立員工帳號。';
  }
  function readChanges(strict=false){
    const out={};salaryFields.forEach(([key,label,type])=>{const value=$('field-'+key).value;if(value===''){if(strict)throw new Error('請填寫'+label+'。');return;}if(type==='number'){const num=Number(value);if(!Number.isFinite(num)||num<0)throw new Error(label+'請填有效的非負數字。');if(key.startsWith('ot')&&num<1)throw new Error(label+'必須大於或等於 1。');out[key]=num;}else out[key]=value;});
    if(strict){if(out.salary_type==='時薪'&&!(out.hourly_rate>0))throw new Error('時薪制必須填入大於 0 的時薪。');if(out.salary_type==='月薪'&&!(out.monthly_salary>0))throw new Error('月薪制必須填入大於 0 的月薪。');}
    return out;
  }
  function readReason(){const value=$('reason').value.trim();if(!value)throw new Error('請填寫本次儲存／核准原因。');return value;}
  async function saveDraft(){if(mustReload)throw new Error('請先重新讀取此筆。');const changes=readChanges(),reason=readReason();const data=await api('hr_admin_save',{case_id:selected.case_id,expected_revision:selected.revision,changes,reason});selected=data.case;await loadList();renderDetail();message('草稿已儲存，尚未建立帳號。');}
  function reviewApproval(){if(busy||mustReload)return;try{const changes=readChanges(true),reason=readReason();approvalRevision={case_id:selected.case_id,expected_revision:selected.revision,changes,reason};const dl=el('dl',undefined,'details-list');detailRow(dl,'姓名',selected.name);detailRow(dl,'收件信箱',selected.email);detailRow(dl,'到職日',changes.hire_date);detailRow(dl,'僱用類型',changes.employee_type);detailRow(dl,'薪資',changes.salary_type==='月薪'?changes.monthly_salary+' 元／月':changes.hourly_rate+' 元／時');$('approval-summary').replaceChildren(dl);$('approval').showModal();}catch(e){message(e.message,true);}}
  $('confirm-approval').addEventListener('click',()=>run(async()=>{if(!approvalRevision)throw new Error('請重新核對資料。');const payload=approvalRevision;approvalRevision=null;$('approval').close();const data=await api('hr_admin_approve',payload);selected=data.case;await loadList();renderDetail();message(selected.status==='READY'?'帳號建立結果已更新，請查看通知狀態。':'核准已記錄，請查看同步結果。');}));
  $('cancel-approval').addEventListener('click',()=>{$('approval').close();approvalRevision=null;});
  $('login-form').addEventListener('submit',e=>{e.preventDefault();run(async()=>{credential=$('key').value.trim();operator=$('operator').value.trim();if(!operator)throw new Error('請填寫實際操作人姓名。');await loadList();$('key').value='';$('login').hidden=true;if($('ma-auth'))$('ma-auth').hidden=true;$('workspace').hidden=false;if($('registry-setup'))$('registry-setup').hidden=false;$('identity').textContent='操作人：'+operator;const id=new URLSearchParams(location.hash.slice(1)).get('case');if(id&&cases.some(c=>c.case_id===id))await loadCase(id);});});
  $('refresh').addEventListener('click',()=>run(async()=>{await loadList();if(selected)await loadCase(selected.case_id);}));
  function resetWorkspace(){credential='';operator='';selected=null;cases=[];approvalRevision=null;pendingBootstrap=null;mustReload=false;$('key').value='';$('operator').value='';$('cases').replaceChildren();$('detail').replaceChildren();$('workspace').hidden=true;$('login').hidden=false;}
  $('logout').addEventListener('click',()=>{const auth=window.RzdManagerAuth;resetWorkspace();if(auth){auth.logout().catch(()=>{if(!auth.hasSession())message('此頁已登出；伺服器暫時無法確認登出，請關閉頁面。',true);});auth.showLogin();}message('已登出。');});
  if(window.RzdManagerAuth)window.RzdManagerAuth.onSession(user=>{
    resetWorkspace();
    if(!user)return;
    $('login').hidden=true;$('ma-auth').hidden=true;
    $('identity').textContent='操作人：'+(user.canonical_operator||user.name)+'（'+user.email+'）';
    $('registry-setup').hidden=true;
    $('manager-roles').textContent='管理新人到職 · 發布員工薪資單';
    run(async()=>{await loadList();$('workspace').hidden=false;const id=new URLSearchParams(location.hash.slice(1)).get('case');if(id&&cases.some(c=>c.case_id===id))await loadCase(id);});
  });
  $('bootstrap').addEventListener('click',()=>run(async()=>{
    const f=$('registry-file').files[0];if(!f||f.size>150000)throw new Error('請選擇薪資工具產生的員工編號清單（150 KB 以內）。');
    const raw=JSON.parse(await f.text()),items=raw.employees||raw.records;if(!Array.isArray(items))throw new Error('員工編號清單格式錯誤。');
    const records=items.map(r=>({id:String(r.employee_id||r.id||''),name:r.name,...(r.punch_name?{punch_name:r.punch_name}:{})}));
    const conflicts=raw.known_id_conflicts||[];if(!Array.isArray(conflicts))throw new Error('歷史編號衝突清單格式錯誤。');
    const known_id_conflicts=conflicts.map(r=>{if(r.retired!==undefined&&typeof r.retired!=='boolean')throw new Error('歷史編號的離職註記格式錯誤。');return {id:String(r.id||''),local_name:r.local_name,punch_name:r.punch_name,reason:r.reason,...(r.leave_name?{leave_name:r.leave_name}:{}),...(r.retired!==undefined?{retired:r.retired}:{})};});
    const reason=$('bootstrap-reason').value.trim();if(!reason)throw new Error('請填寫設定原因。');
    pendingBootstrap={records,known_id_conflicts,reason};const lines=records.map(r=>r.id+' · '+r.name+(r.punch_name?'（已核對打卡別名：'+r.punch_name+'）':''));
    if(known_id_conflicts.length)lines.push('','歷史重號：僅保留編號，不合併人員。',...known_id_conflicts.map(r=>r.id+'：本機 '+r.local_name+'／打卡 '+r.punch_name+(r.leave_name?'／請假 '+r.leave_name:'')+'；'+(r.retired===true?'已確認皆離職，編號永久保留；含此編號的舊資料不自動重新計薪。':'歸屬尚待處理，新薪資入口將暫停計薪。')+'；'+r.reason));
    $('registry-summary').textContent=lines.join('\n');$('registry-review').showModal();
  }));
  $('cancel-bootstrap').addEventListener('click',()=>{pendingBootstrap=null;$('registry-review').close();});
  $('confirm-bootstrap').addEventListener('click',()=>run(async()=>{if(!pendingBootstrap)throw new Error('請重新選擇名冊並核對。');const payload=pendingBootstrap;pendingBootstrap=null;$('registry-review').close();await api('hr_admin_bootstrap',payload);message('既有編號已保留，未更改既有員工或歷史紀錄。');}));
  window.addEventListener('pagehide',()=>{credential='';operator='';});
})();
