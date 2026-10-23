import {Node,Edge,Settings} from './domain';
export const MODEL='CASM-1.0';export const SEED=20261021;
export const nodes:Node[]=Array.from({length:30},(_,id)=>({id,row:Math.floor(id/10),col:id%10,x:80+(id%10)*84,y:130+Math.floor(id/10)*150+Math.sin(id%10)*12}));
export const edges:Edge[]=[];
function add(a:number,b:number,corridor:number){const row=nodes[a].row,vertical=nodes[a].col===nodes[b].col;edges.push({id:`${a}-${b}`,a,b,corridor,km:vertical?.44:[.78,.72,1.01][row],speed:vertical?28:[39,62,43][row],capacity:vertical?75:[46,32,38][row],rise:vertical?4:[3,11,6][row],accessible:!vertical&&row===2&&nodes[a].col===4?null:!(!vertical&&row===2&&nodes[a].col===5),slope:row===2?7:row===1?4:2});}
for(let r=0;r<3;r++)for(let c=0;c<9;c++)add(r*10+c,r*10+c+1,r);
for(const c of [0,3,6,9]){add(c,c+10,-1);add(c+10,c+20,-1);}
export const corridors=['Canopy Avenue','Central Expressway','Riverside Drive'];
export const personas:Record<string,number[]>={'Student':[.15,.65,.15,.05],'Time-pressed commuter':[.90,.02,.02,.06],'Eco-conscious traveller':[.1,.05,.75,.1],'Traveller with mobility requirements':[.3,.15,.3,.25],'Custom':[.25,.25,.25,.25]};
export const defaults:Settings={persona:'Eco-conscious traveller',vehicle:'Petrol car',occupancy:1,grid:420,weights:personas['Eco-conscious traveller'],stepFree:false,walkMax:1000,slopeMax:10,avoidUnknown:false,origin:10,destination:19,horizon:20,incident:false,facility:0,full:false,delay:0,inaccessible:false,unavailable:false};
export const facilities=[{name:'Canopy Interchange',node:3,walk:320,parking:1,period:8,ride:8,occupancy:72,access:'Verified step-free'},{name:'Rivergate Hub',node:23,walk:580,parking:1.6,period:6,ride:7,occupancy:48,access:'Unverified'}];
export function seeded(seed:number){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
