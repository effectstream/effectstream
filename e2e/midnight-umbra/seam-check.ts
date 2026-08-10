import { run } from "effection";
import { MidnightFetcher } from "@effectstream/sync";
const PRIM={syncProtocol:"p",primitive:{name:"Midnight-UnshieldedCreate",type:"Midnight:UnshieldedCreate",startBlockHeight:1,scheduledPrefix:"x"}} as any;
const mk=(src:"indexer"|"umbra",netId="undeployed")=>new MidnightFetcher({
  syncProtocol:{name:`p_${src}`,type:"midnight-parallel",startBlockHeight:1,pollingInterval:1000,stepSize:10,
    ...(src==="indexer"?{indexer:process.env.IDX}:{umbra:{databaseUrl:process.env.PG,schema:"stock_archive",net:"undeployed",unsafeAllowIncompleteEffects:true}})},
  network:{name:"midnight",type:"midnight",networkId:netId},primitives:[PRIM]} as any);

// --- guards -------------------------------------------------------------
const guard=(label:string,fn:()=>unknown)=>{ try{ fn(); console.log(`GUARD ${label}: NOT ENFORCED`); }
  catch(e){ console.log(`GUARD ${label}: ok — ${(e as Error).message.slice(0,72)}…`); } };
guard("both sources",()=>new MidnightFetcher({syncProtocol:{name:"p",type:"midnight-parallel",startBlockHeight:1,pollingInterval:1,stepSize:1,indexer:"http://x",umbra:{databaseUrl:"postgres://x",net:"n"}},network:{networkId:"undeployed"},primitives:[PRIM]} as any));
guard("neither source",()=>new MidnightFetcher({syncProtocol:{name:"p",type:"midnight-parallel",startBlockHeight:1,pollingInterval:1,stepSize:1},network:{networkId:"undeployed"},primitives:[PRIM]} as any));
guard("mainnet rejected",()=>mk("umbra","mainnet"));
guard("unsupported primitive",()=>new MidnightFetcher({syncProtocol:{name:"p",type:"midnight-parallel",startBlockHeight:1,pollingInterval:1,stepSize:1,umbra:{databaseUrl:process.env.PG,net:"undeployed"}},network:{networkId:"undeployed"},primitives:[{syncProtocol:"p",primitive:{name:"g",type:"Midnight:Generic"}}]} as any));

// --- differential on the create-bearing blocks ---------------------------
const fi=mk("indexer"), fu=mk("umbra");
let cmp=0,ok=0,bad=0,rows=0;
for(const h of [72,102,131,10662,10690]){
  const emit=async(f:MidnightFetcher)=>{ const b=await f.client.fetchBlock(h,{unshieldedCreatedOutputs:true});
    const ps:any[]=await run(()=>f.readPrimitives(h,b,[PRIM]));
    return ps.map(p=>`${p.syncProtocol.transactionHash}|${p.output.payload.owner}|${p.output.payload.intentHash}|${p.output.payload.outputIndex}|${p.output.payload.value}|${String(p.output.payload.tokenType).toLowerCase()}`).sort().join("\n"); };
  const a=await emit(fi), b=await emit(fu);
  cmp++; if(a===b){ok++; rows+=a?a.split("\n").length:0; console.log(`h=${h}: STM inputs MATCH (${a?a.split("\n").length:0})`);}
  else{bad++; console.log(`h=${h}: MISMATCH\n indexer:\n${a}\n umbra:\n${b}`);}
}
console.log(`\nblocks=${cmp} match=${ok} mismatch=${bad} stmInputRows=${rows}`);
await fu.close(); await fi.close();
console.log("closed cleanly");
