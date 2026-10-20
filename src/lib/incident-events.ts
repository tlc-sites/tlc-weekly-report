type EventSource={id:string;occurred_on:string;service_id:string|null;service_name:string};
export function groupIncidentEvents<T extends EventSource>(items:T[]) {
  const events=new Map<string,{key:string;date:string;name:string;items:T[]}>();
  const normalize=(name:string)=>name.replace(/\s+/g,"").toUpperCase();
  const knownIds=new Map<string,Set<string>>();
  for(const item of items)if(item.service_id){const name=normalize(item.service_name);const ids=knownIds.get(name)??new Set<string>();ids.add(item.service_id);knownIds.set(name,ids);}
  for(const item of items){const ids=knownIds.get(normalize(item.service_name));const service=item.service_id || (ids?.size===1 ? [...ids][0] : normalize(item.service_name));const key=JSON.stringify([item.occurred_on,service]);const event=events.get(key) ?? {key,date:item.occurred_on,name:item.service_name,items:[]};event.items.push(item);events.set(key,event);}
  return [...events.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name,"ko"));
}
