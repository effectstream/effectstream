/**
 * Validates the notify-don't-copy seam end to end:
 *  1. TRIGGERS — the real MidnightFetcher, driven by each source, fires for the SAME transactions
 *     at the SAME heights, with the same `{ txHash }` payload. Includes height 0, where 20
 *     ClaimRewards transactions previously HALTED the umbra path — under the new design they
 *     trigger like any other data-bearing transaction.
 *  2. ON-DEMAND READ — for every fired trigger, `UmbraRead.getUnshieldedCreates(txHash)` returns
 *     rows identical to the indexer's, or a typed refusal exactly where the indexer's rows are
 *     underivable from archived bytes (ClaimRewards). Nothing is silently empty.
 */
import { run } from "effection";
import { MidnightFetcher, UmbraRead } from "@effectstream/sync";

const PRIM={syncProtocol:"p",primitive:{name:"Midnight-UnshieldedCreate",type:"Midnight:UnshieldedCreate",startBlockHeight:1,scheduledPrefix:"x"}} as any;
const mk=(src:"indexer"|"umbra")=>new MidnightFetcher({
  syncProtocol:{name:`p_${src}`,type:"midnight-parallel",startBlockHeight:1,pollingInterval:1000,stepSize:10,
    ...(src==="indexer"?{indexer:process.env.IDX}:{umbra:{databaseUrl:process.env.PG,schema:"stock_archive",net:"undeployed",unsafeAllowIncompleteEffects:true}})},
  network:{name:"midnight",type:"midnight",networkId:"undeployed"},primitives:[PRIM]} as any);
const gql=async(q:string,v?:any)=>(await (await fetch(process.env.IDX!,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:q,variables:v})})).json());

const fi=mk("indexer"), fu=mk("umbra");
const HEIGHTS=[0,45,72,102,131,10662,10690];
let blocks=0, trigMatch=0, trigMism=0, totalTriggers=0;
const fired:string[]=[];
for(const h of HEIGHTS){
  const trig=async(f:MidnightFetcher)=>{ const b=await f.client.fetchBlock(h,{unshieldedCreatedOutputs:true});
    const ps:any[]=await run(()=>f.readPrimitives(h,b,[PRIM]));
    return ps.map(p=>`${p.syncProtocol.blockNumber}|${p.output.payload.txHash}`).sort(); };
  const a=await trig(fi), b=await trig(fu);
  blocks++;
  if(a.join()===b.join()){ trigMatch++; totalTriggers+=a.length; fired.push(...a); console.log(`h=${h}: triggers MATCH (${a.length})`); }
  else { trigMism++; console.log(`h=${h}: TRIGGER MISMATCH\n indexer: ${a.join(", ")}\n umbra:   ${b.join(", ")}`); }
}

// 2. on-demand read for every fired trigger
const reader=new UmbraRead({databaseUrl:process.env.PG!,schema:"stock_archive",net:"undeployed",networkId:"undeployed",unsafeAllowIncompleteEffects:true});
let readExact=0, readRefusedExpected=0, readBad=0;
for(const f of fired){
  const [hStr,txHash]=f.split("|"); const h=Number(hStr);
  const d=await gql(`query($h:Int!){ block(offset:{height:$h}){ transactions { hash unshieldedCreatedOutputs { owner intentHash outputIndex value tokenType } } } }`,{h});
  const want=((d?.data?.block?.transactions??[]).find((x:any)=>x.hash===txHash)?.unshieldedCreatedOutputs??[]) as any[];
  const out=await reader.getUnshieldedCreates(txHash);
  if(!out.ok){
    if(out.refusal.reason==="claim_rewards" && want.length>0){ readRefusedExpected++; continue; } // consumer decides; indexer derives via ledger-internal reconstruction
    readBad++; console.log(`  read ${txHash.slice(0,12)}…: unexpected refusal ${out.refusal.reason}`); continue;
  }
  const key=(x:any)=>`${x.owner}|${x.intentHash}|${x.outputIndex}|${x.value}|${String(x.tokenType).toLowerCase()}`;
  if(want.map(key).sort().join("\n")===out.outputs.map(key).sort().join("\n")) readExact++;
  else { readBad++; console.log(`  read ${txHash.slice(0,12)}…: ROWS DIFFER (indexer=${want.length} read=${out.outputs.length})`); }
}
console.log(`\ntriggers: blocks=${blocks} match=${trigMatch} mismatch=${trigMism} fired=${totalTriggers}`);
console.log(`reads:    exact=${readExact} refused-as-designed(ClaimRewards)=${readRefusedExpected} bad=${readBad}`);
await reader.close(); await (fu as any).close(); await (fi as any).close();
console.log((trigMism===0&&readBad===0&&totalTriggers>0)?"SEAM CHECK: PASS":"SEAM CHECK: FAIL");
