const birthYearOffsets:Record<string,[number,number]>={"영유아부":[0,4],"영·유아부":[0,4],"유치부":[5,6],"유년부":[7,8],"초등부":[9,10],"소년부":[11,12],"영어예배":[9,12],"어린이영어":[9,12],"중등부":[13,15],"고등부":[16,18],"중고등부":[13,18]};
// 한국의 현재 연도를 기준으로 매년 같은 연령대의 출생연도를 표시한다.
export function groupDisplayName(name:string,year=Number(new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Seoul"}).slice(0,4))){
 const base=name.replace(/ \(\d{2,4}~\d{2,4}년생\)/g,"");
 const label=base==="영유아부"?"영·유아부":base==="영어예배"?"어린이영어":base;
 const offsets=birthYearOffsets[base];
 const yy=(offset:number)=>String(year-offset).slice(-2).padStart(2,"0");
 return offsets?label+" ("+yy(offsets[0])+"~"+yy(offsets[1])+"년생)":label;
}

export function meetingDisplayName(name:string){return name==="학교예배"||name==="학교 예배"?"채플":name;}
