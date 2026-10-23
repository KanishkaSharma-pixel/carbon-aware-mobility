import {Receipt,Wallet} from './domain';
export function award(w:Wallet,r:Receipt):Wallet{if(w.receipts.some(x=>x.id===r.id))return w;return{receipts:[r,...w.receipts],transactions:[{id:'award-'+r.id,type:'Trip reward',points:r.points,timestamp:r.timestamp},...w.transactions]};}
export function balance(w:Wallet){return w.transactions.reduce((a,t)=>a+t.points,0);}
export function redeem(w:Wallet,label:string,price:number,token:string):Wallet{if(w.transactions.some(t=>t.id===token))return w;if(balance(w)<price)throw Error(`Insufficient points. ${price} required; ${balance(w)} available.`);return{...w,transactions:[{id:token,type:label,points:-price,timestamp:new Date().toISOString(),voucher:'DEMO-'+token.slice(-8).toUpperCase()},...w.transactions]};}
export function readLocal<T>(key:string,fallback:T):T{try{const s=localStorage.getItem(key);if(!s)return fallback;const v=JSON.parse(s);return v&&typeof v==='object'?{...fallback,...v}:fallback;}catch{return fallback;}}
