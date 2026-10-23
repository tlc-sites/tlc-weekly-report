import {Field,inputClass} from "./ui";
export function CampusDepartureField({defaultDate}:{defaultDate:string}){return <Field label="분당 출발 날짜" hint="이전 주를 포함해 실제 출발 날짜를 자유롭게 선택해 주세요. 출발일과 보고 주차는 별도로 저장됩니다."><input name="meetingDate" type="date" required defaultValue={defaultDate} className={inputClass}/></Field>;}
