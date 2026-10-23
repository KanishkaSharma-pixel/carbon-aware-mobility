import {edges,facilities} from './fixtures';import {forecast} from './routing';import {Settings} from './domain';
export interface TrafficAdapter{read(s:Settings):ReturnType<typeof forecast>}
export interface ElevationAdapter{metres(edgeId:string):number|undefined}
export interface TransitAdapter{timetable():typeof facilities}
export interface GridAdapter{intensity():{gPerKwh:number;source:string}}
export interface TelemetryAdapter{read():{speed:number;source:string;optIn:boolean}}
const staticCache=new Map(edges.map(e=>[e.id,Object.freeze({...e})]));
export const fixtureAdapters={traffic:{read:(s:Settings)=>forecast(s)},elevation:{metres:(id:string)=>staticCache.get(id)?.rise},transit:{timetable:()=>facilities},grid:(value:number)=>({intensity:()=>({gPerKwh:value,source:'Configurable scenario input'})}),telemetry:{read:()=>({speed:28,source:'Simulated; opt-in concept only',optIn:false})}};
export const cacheStatus={staticRoads:staticCache.size,vehicleFactors:4,dynamic:'Traffic adjustments recomputed when scenario inputs change; immutable road fixtures cached in module memory. No cloud or edge deployment.'};
