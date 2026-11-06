-- DB 43: 관리자가 앱에서 PD 체크리스트 템플릿을 고친다. 고칠 때마다 새 버전을 더한다(이미 만든 회차는 만들 때의 버전으로 보인다).
-- 새 예배(복제)도 같은 함수로 만든다: 그 예배에 버전이 없으면 p_base_version=0 으로 v1을 만든다.
-- 내용 검사는 앱(src/lib/pd-template-schema.ts)에서 자세히 하고, 여기서는 화면이 깨지지 않을 뼈대와 크기만 본다.
create function report.pd_template_save(p_service text, p_base_version int, p_content jsonb) returns int
language plpgsql security definer set search_path='' as $$
declare cur int; c jsonb := p_content;
begin
 if not report.is_admin() then raise exception 'admin required' using errcode='42501'; end if;
 if p_service is null or p_service !~ '^[a-z0-9_]{1,20}$' then raise exception 'bad service' using errcode='22023'; end if;
 if jsonb_typeof(c) is distinct from 'object' or octet_length(c::text)>200000
  or jsonb_typeof(c->'name') is distinct from 'string' or char_length(c->>'name') not between 1 and 40
  or coalesce(c->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  or jsonb_typeof(c->'conditions') is distinct from 'array' or jsonb_typeof(c->'teams') is distinct from 'array'
  or jsonb_typeof(c#>'{page1,rows}') is distinct from 'array'
  or jsonb_typeof(c#>'{page2,flow}') is distinct from 'array' or jsonb_typeof(c#>'{page2,roster}') is distinct from 'array'
  or jsonb_typeof(c#>'{page2,during,items}') is distinct from 'array' or jsonb_typeof(c#>'{page2,after,items}') is distinct from 'array'
  or jsonb_typeof(c#>'{page2,report,categories}') is distinct from 'array' or jsonb_typeof(c#>'{page2,report,fields}') is distinct from 'array'
 then raise exception 'bad template' using errcode='22023'; end if;
 -- 두 관리자가 같은 버전을 고쳐 동시에 저장하면 뒤의 사람은 다시 불러와 고치게 한다.
 perform pg_advisory_xact_lock(hashtext('report.pd_templates:'||p_service));
 select max(version) into cur from report.pd_templates where service_key=p_service;
 if coalesce(cur,0)<>coalesce(p_base_version,-1) then raise exception 'version conflict' using errcode='22023'; end if;
 insert into report.pd_templates(service_key,version,content,created_by)
 values(p_service,coalesce(cur,0)+1,c||jsonb_build_object('id',p_service),auth.uid());
 return coalesce(cur,0)+1;
end $$;
revoke all on function report.pd_template_save(text,int,jsonb) from public,anon;
grant execute on function report.pd_template_save(text,int,jsonb) to authenticated;
