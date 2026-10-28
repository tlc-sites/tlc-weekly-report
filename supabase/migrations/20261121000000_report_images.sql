-- 보고서 사진 첨부. 파일은 비공개 Storage 버킷에 두고, 경로의 첫 폴더(보고서 ID)로 권한을 확인한다.
-- 휴대폰에서 줄인 JPEG만 받는다 (장당 1MB 이하, 보고서당 5장).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-images', 'report-images', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

create table report.report_images(
 id uuid primary key default gen_random_uuid(),
 report_id uuid not null references report.reports(id) on delete cascade,
 path text not null unique check(path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
 caption text not null default '' check(char_length(caption)<=200),
 created_by uuid not null references report.profiles(id),
 created_at timestamptz not null default now(),
 check(split_part(path,'/',1)=report_id::text));
create index report_images_report on report.report_images(report_id,created_at);
alter table report.report_images enable row level security;
revoke all on report.report_images from public,anon,authenticated;
grant select,insert,delete on report.report_images to authenticated;
create policy report_images_read on report.report_images for select to authenticated using(report.can_view_report(report_id));
create policy report_images_add on report.report_images for insert to authenticated
 with check(created_by=auth.uid() and report.can_edit_report(report_id));
create policy report_images_remove on report.report_images for delete to authenticated using(report.can_edit_report(report_id));

create function report.limit_report_images() returns trigger language plpgsql set search_path='' as $$
begin
 perform 1 from report.reports where id=new.report_id for update;
 if (select count(*) from report.report_images where report_id=new.report_id)>=5 then raise exception 'too many report images'; end if;
 return new;
end $$;
revoke all on function report.limit_report_images() from public,anon,authenticated;
create trigger report_images_limit before insert on report.report_images for each row execute function report.limit_report_images();

-- Storage 경로 'report ID/파일'에서 보고서 ID를 꺼낸다. 형식이 다르면 null이라 권한이 열리지 않는다.
create function report.image_report_id(object_name text) returns uuid
language sql immutable set search_path='' as $$
  select case when object_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' then split_part(object_name,'/',1)::uuid end;
$$;
grant execute on function report.image_report_id(text) to authenticated;

create policy report_images_object_read on storage.objects for select to authenticated
 using(bucket_id='report-images' and report.can_view_report(report.image_report_id(name)));
create policy report_images_object_add on storage.objects for insert to authenticated
 with check(bucket_id='report-images' and report.can_edit_report(report.image_report_id(name)));
create policy report_images_object_remove on storage.objects for delete to authenticated
 using(bucket_id='report-images' and report.can_edit_report(report.image_report_id(name)));
