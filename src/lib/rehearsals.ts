export type RehearsalMark={member_id:string;status:"attended"|"absent"|"excused"};
export function rehearsalTotals(people:{id:string;name:string}[],marks:RehearsalMark[],sort:"absent"|"name"){
  return people.map(p=>({...p,attended:marks.filter(m=>m.member_id===p.id&&m.status==="attended").length,absent:marks.filter(m=>m.member_id===p.id&&m.status==="absent").length,excused:marks.filter(m=>m.member_id===p.id&&m.status==="excused").length})).sort((a,b)=>sort==="absent" ? (b.absent+b.excused)-(a.absent+a.excused) || a.name.localeCompare(b.name,"ko"):a.name.localeCompare(b.name,"ko"));
}
