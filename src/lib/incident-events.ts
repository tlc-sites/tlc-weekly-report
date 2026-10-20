type EventSource={id:string;occurred_on:string;service_id:string|null;service_name:string};
export function groupIncidentEvents<T extends EventSource>(items:T[]) {
  const events=new Map<string,{key:string;date:string;name:string;items:T[]}>();
  for(const item of items){const key=JSON.stringify([item.occurred_on,item.service_id || item.service_name.trim()]);const event=events.get(key) ?? {key,date:item.occurred_on,name:item.service_name,items:[]};event.items.push(item);events.set(key,event);}
  return [...events.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name,"ko"));
}
