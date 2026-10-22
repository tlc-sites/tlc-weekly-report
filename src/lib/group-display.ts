const birthYears:Record<string,string>={"영유아부":"26~22","영·유아부":"26~22","유치부":"21~20","유년부":"19~18","초등부":"17~16","소년부":"15~14","영어예배":"17~14","어린이영어":"17~14","중등부":"13~08","고등부":"13~08","중고등부":"13~08"};
export function groupDisplayName(name:string){const label=name==="영유아부"?"영·유아부":name==="영어예배"?"어린이영어":name;return birthYears[name]?label+" ("+birthYears[name]+"년생)":label;}

export function meetingDisplayName(name:string){return name==="학교예배"||name==="학교 예배"?"채플":name;}
