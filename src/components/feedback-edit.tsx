"use client";
import {useActionState} from "react";
import {editFeedback} from "@/app/notifications/edit-actions";
import {SubmitButton} from "./submit-button";
import {textareaClass,smallButtonClass} from "./ui";
export function FeedbackEdit({kind,id,body}:{kind:string;id:string;body:string}){const [state,action]=useActionState(editFeedback,{error:"",saved:false});return <details className="mt-2"><summary className="cursor-pointer text-xs text-accent">수정</summary><form action={action} className="mt-2 space-y-2"><input type="hidden" name="kind" value={kind}/><input type="hidden" name="id" value={id}/><textarea aria-label="코멘트 수정" name="body" defaultValue={body} required maxLength={1000} rows={3} className={textareaClass}/><SubmitButton className={smallButtonClass} pendingText="수정 중…">수정 저장</SubmitButton>{state.error?<p role="alert" className="text-xs text-danger">{state.error}</p>:state.saved?<p role="status" className="text-xs text-accent">수정했습니다.</p>:null}</form></details>;}
