// 브라우저는 폼을 보낼 때 줄바꿈을 \r\n(2글자)으로 바꿔 보낸다.
// 화면의 maxLength와 DB의 char_length는 줄바꿈을 1글자로 세므로, 서버도 \n으로 맞춘 뒤 검사·저장한다.
export function lf<T>(value: T): T | string {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n") : value;
}

/** Object.fromEntries(form) 대신 쓴다. 글자 값의 줄바꿈을 \n으로 맞춘다. */
export function formFields(form: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, lf(v) as FormDataEntryValue]));
}
