"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Card, buttonClass, inputClass, secondaryButtonClass, selectClass, smallButtonClass, textareaClass } from "@/components/ui";
import { ISSUE_STATUS_LABEL, REQUEST_CATEGORIES, missingOnSubmit } from "@/lib/report-forms";

import {FieldErrors,FieldHighlight,FailureDialog} from "@/components/form-validation";
import {useAutosaveContext} from "./autosave-context";
import {InfoTip} from "@/components/info-tip";
import {HELP} from "@/lib/help-text";

export type Messages = { pastor: string; pastor_wife: string };
export type Request = { category: (typeof REQUEST_CATEGORIES)[number]; content: string };
export type Issue = { category: string; content: string; status: keyof typeof ISSUE_STATUS_LABEL; action: string };

export function Section({ title, hint, info, children }: { title: string; hint?: string; info?: { body: ReactNode; guide?: string }; children: ReactNode }) {
  const heading = <h2 className="mb-1 text-sm font-semibold">{title}</h2>;
  return (
    <FieldHighlight label={title}><section className="mb-5">
      {info ? <InfoTip title={heading} guide={info.guide}>{info.body}</InfoTip> : heading}
      {hint ? <p className="mb-2 text-xs text-muted">{hint}</p> : null}
      <Card className="flex flex-col gap-3">{children}</Card>
    </section></FieldHighlight>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  maxLength = 1000,
  required = false,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <FieldHighlight label={label??""}><label className="flex flex-col gap-1.5">
      {label ? (
        <span className="text-sm font-medium">
          {label}
          {required ? <span className="text-danger"> *</span> : null}
        </span>
      ) : null}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
        className={textareaClass}
      />
    </label></FieldHighlight>
  );
}

// 보고 폼: 상태를 JSON으로 담아 서버 액션에 보낸다. 제출일 때만 필수 항목을 먼저 확인한다.
export function ReportForm({
  action,
  reportId,
  type,
  payload,
  extraCheck,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  reportId: string;
  type: string;
  payload: unknown;
  extraCheck?: () => string | null;
  children: ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  const [issues,setIssues]=useState<string[]>([]);
  const [errorKey,setErrorKey]=useState(0);
  const showError=(message:string)=>{setError(message);setErrorKey(key=>key+1);};

  // 임시저장은 버튼으로만 한다. 버전은 다른 기기에서 바뀐 내용을 덮어쓰지 않도록 확인하는 데 쓴다.
  const sync=useAutosaveContext();
  const serialized=JSON.stringify(payload);
  const [savedPayload]=useState(serialized);
  const [manual,setManual]=useState(false);
  useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(sync.enabled&&serialized!==savedPayload&&!manual){event.preventDefault();}};window.addEventListener("beforeunload",guard);return()=>window.removeEventListener("beforeunload",guard);},[serialized,savedPayload,sync.enabled,manual]);

  async function submitAction(formData:FormData){
    try{await action(formData);}catch(cause){
      const digest=typeof cause==="object"&&cause!==null&&"digest" in cause?String(cause.digest):"";
      if(digest.startsWith("NEXT_REDIRECT"))throw cause;
      showError("서버와 연결하지 못했거나 저장 중 오류가 발생했습니다. 입력 내용은 현재 화면에 남아 있습니다. 인터넷 연결을 확인하고 다시 제출해 주세요.");
    }finally{setManual(false);}
  }
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const extra = extraCheck?.();
    if (extra) {
      event.preventDefault();
      showError(extra);
      return;
    }
    if (submitter?.value === "submit") {
      const missing = missingOnSubmit(type, payload);
      if (missing.length) {
        event.preventDefault();
        setIssues(missing);
        showError(`제출하려면 다음 항목을 채워 주세요:\n${missing.join("\n")}`);
        return;
      }
    }
    setManual(true);
    setError(null);
  }

  return (
    <FieldErrors value={issues.filter(issue=>missingOnSubmit(type,payload).includes(issue))}><form action={submitAction} onSubmit={onSubmit} noValidate>
      <input type="hidden" name="reportId" value={reportId} />
      <input type="hidden" name="draftVersion" value={sync.enabled?sync.version:""} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {children}
      {error ? (
        <p role="alert" className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <InfoTip className="mt-3" title={<span className="text-sm font-semibold">임시저장 · 제출</span>} guide={HELP.save.guide}>{HELP.save.body}</InfoTip>
      {sync.enabled&&savedPayload!==serialized?<p role="status" aria-live="polite" className="my-3 text-sm text-muted">저장하지 않은 변경 내용이 있습니다. 이어서 쓰려면 「임시저장」을 눌러 주세요.</p>:null}
      {error?<FailureDialog key={errorKey} message={error}/>:null}
      <SubmitBar />
    </form></FieldErrors>
  );
}

function SubmitBar() {
  const { pending } = useFormStatus();
  return (
    <div className="report-submit-bar sticky -mx-4 flex gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
      <button type="submit" name="intent" value="draft" disabled={pending} className={`${secondaryButtonClass} flex-1`}>
        임시저장
      </button>
      <button type="submit" name="intent" value="submit" disabled={pending} className={`${buttonClass} flex-1`}>
        {pending ? "저장 중…" : "제출"}
      </button>
    </div>
  );
}

export function RequestsEditor({ value, onChange }: { value: Request[]; onChange: (v: Request[]) => void }) {
  const update = (i: number, patch: Partial<Request>) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <>
      {value.map((r, i) => (
        <div key={i} className="flex gap-2">
          <select
            value={r.category}
            onChange={(e) => update(i, { category: e.target.value as Request["category"] })}
            className={`${selectClass} w-24 shrink-0`}
          >
            {REQUEST_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            value={r.content}
            onChange={(e) => update(i, { content: e.target.value })}
            maxLength={500}
            placeholder="요청 내용"
            className={inputClass}
          />
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className={`${smallButtonClass} h-11`}>
            삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { category: "시설", content: "" }])}
        className={`${smallButtonClass} self-start`}
      >
        + 요청사항 추가
      </button>
    </>
  );
}

export function IssuesEditor({
  value,
  onChange,
  categories,
  hint,
}: {
  value: Issue[];
  onChange: (v: Issue[]) => void;
  categories: readonly string[];
  hint?: (category: string) => string | null;
}) {
  const update = (i: number, patch: Partial<Issue>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <>
      {value.map((issue, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex gap-2">
            <select value={issue.category} onChange={(e) => update(i, { category: e.target.value })} className={selectClass}>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              value={issue.status}
              onChange={(e) => update(i, { status: e.target.value as Issue["status"] })}
              className={selectClass}
            >
              {Object.entries(ISSUE_STATUS_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {hint?.(issue.category) ? <p className="text-xs text-muted">{hint(issue.category)}</p> : null}
          <TextArea value={issue.content} onChange={(v) => update(i, { content: v })} placeholder="무슨 일이 있었는지" rows={2} />
          <TextArea value={issue.action} onChange={(v) => update(i, { action: v })} placeholder="조치·개선 방안 (선택)" rows={2} />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className={`${smallButtonClass} self-end`}
          >
            이슈 삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { category: categories[0], content: "", status: "open", action: "" }])}
        className={`${smallButtonClass} self-start`}
      >
        + 이슈 추가
      </button>
    </>
  );
}

export function MessagesEditor({ value, onChange }: { value: Messages; onChange: (v: Messages) => void }) {
  return (
    <Section title="담임 목사님·담임 사모님께 드리는 글 (선택)" info={HELP.privateNote} hint="작성자와 담임 목사님·담임 사모님, 담당 교역자가 볼 수 있습니다. 두 분이 다른 교역자에게 추가 공개할 수 있습니다.">
      <TextArea
        label="담임 목사님께"
        value={value.pastor}
        onChange={(v) => onChange({ ...value, pastor: v })}
        placeholder="담임 목사님께 직접 전하고 싶은 내용"
      />
      <TextArea
        label="담임 사모님께"
        value={value.pastor_wife}
        onChange={(v) => onChange({ ...value, pastor_wife: v })}
        placeholder="담임 사모님께 직접 전하고 싶은 내용"
      />
    </Section>
  );
}
