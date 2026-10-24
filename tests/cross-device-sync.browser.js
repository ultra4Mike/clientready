// pt473u repro: desktop + mobile contexts, test owner only. Resolve/unresolve a day on the server (as the "web"),
// then focus the stale phone page and confirm it shows the server state within seconds. Restores the row after.
const {chromium}=require('playwright-core');const fs=require('fs');
const {createClient}=require('@supabase/supabase-js');
const B=process.env.B||'http://localhost:3311';
const L=fs.readFileSync('/workspace/cr-sandbox-env/owner-login.txt','utf8');const email=L.match(/email:\s*(\S+)/)[1],pw=L.match(/password:\s*(\S+)/)[1];
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).trim().replace(/^["']|["']$/g,'')]));
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function login(ctx){const p=await ctx.newPage();await p.goto(B+'/login');await p.waitForTimeout(1500);await p.locator('input[type=email]').fill(email);await p.locator('input[type=password]').fill(pw);await p.locator('button[type=submit]').click();await p.waitForURL(u=>!/\/login/.test(u.pathname),{timeout:20000});return p;}
const state=async(p)=>p.evaluate(()=>({open:document.querySelectorAll('[data-testid=ts-alert]').length,resolved:document.querySelectorAll('[data-testid=ts-alert-resolved]').length,approved:document.querySelectorAll('[data-testid=ts-approved]').length}));
(async()=>{
 const {error:ae}=await sb.auth.signInWithPassword({email,password:pw});if(ae)throw new Error('node login failed');
 const br=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 const web=await br.newContext({viewport:{width:1280,height:900}}), phone=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const pw1=await login(web), pp=await login(phone);
 await pw1.goto(B+'/timesheet');await pp.goto(B+'/timesheet');
 await Promise.all([pw1,pp].map(p=>p.waitForSelector('[data-testid=ts-loading]',{state:'detached',timeout:30000}).catch(()=>{})));await pp.waitForTimeout(2000);
 const week=await pp.evaluate(()=>{const d=new Date();const s=new Date(d);s.setDate(d.getDate()-((d.getDay()+6)%7));return s.toISOString().slice(0,10)});
 // any day this week with hours: use an existing approval row or a crew worker with events
 let {data:rows}=await sb.from('crew_day_approvals').select('*').gte('work_date',addD(week,-7)).lte('work_date',addD(week,7));
 rows=(rows||[]);console.log('approval rows near this week:',rows.length);
 const before=await state(pp);console.log('phone before',JSON.stringify(before),'web',JSON.stringify(await state(pw1)));
 const target=rows.find(r=>r.work_date>=week&&r.work_date<=addD(week,6));
 if(!target){console.log('SKIP: no approval row this week in test data');await br.close();process.exit(2);}
 const orig={...target};const flip=target.approved_at?null:new Date().toISOString();
 // "web" resolves/unresolves (server write as the owner, exactly what Approve does)
 const {error:ue}=await sb.from('crew_day_approvals').update({approved_at:flip,updated_at:new Date().toISOString()}).eq('owner_id',orig.owner_id).eq('employee_id',orig.employee_id).eq('work_date',orig.work_date);if(ue)throw ue;
 await pw1.reload();await pw1.waitForSelector('[data-testid=ts-loading]',{state:'detached',timeout:30000}).catch(()=>{});await pw1.waitForTimeout(1500);
 const webAfter=await state(pw1);
 // phone comes to the front: focus + visibilitychange
 const t0=Date.now();await pp.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
 let ph;for(let i=0;i<20;i++){await pp.waitForTimeout(500);ph=await state(pp);if(JSON.stringify(ph)===JSON.stringify(webAfter))break;}
 const secs=((Date.now()-t0)/1000).toFixed(1);
 console.log('web after',JSON.stringify(webAfter),'phone after focus',JSON.stringify(ph),'in',secs+'s',JSON.stringify(ph)===JSON.stringify(webAfter)&&JSON.stringify(webAfter)!==JSON.stringify(before)?'PASS':'CHECK');
 await pp.screenshot({path:'/workspace/sync-phone-after.png'});await pw1.screenshot({path:'/workspace/sync-web-after.png'});
 await sb.from('crew_day_approvals').update({approved_at:orig.approved_at,updated_at:new Date().toISOString()}).eq('owner_id',orig.owner_id).eq('employee_id',orig.employee_id).eq('work_date',orig.work_date);
 console.log('restored original row');await br.close();
})().catch(e=>{console.error(String(e).replace(pw,'***'));process.exit(1)});
function addD(d,n){const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)}
