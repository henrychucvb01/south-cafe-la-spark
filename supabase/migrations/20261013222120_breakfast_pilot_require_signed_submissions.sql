begin;
-- Apply only after the v2 application is live. No records or PINs are changed.
revoke execute on function public.breakfast_teacher_submit(uuid,date,integer,text,boolean,integer) from anon,authenticated;
revoke execute on function public.breakfast_teacher_preorder(uuid,date,date,text,integer,integer) from anon,authenticated;
notify pgrst,'reload schema';
commit;
