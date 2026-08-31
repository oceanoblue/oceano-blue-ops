-- =============================================================
-- 0072 — Undo "I've uploaded everything" (accidental tap)
-- =============================================================
-- mark_field_shoot_uploaded (0053) flips a contractor's shoot to 'uploaded'. If
-- they tap it by mistake BEFORE the office starts processing, they had no way
-- back. This adds the inverse: revert 'uploaded' -> 'shooting' (a pre-upload
-- working state that re-enables the upload UI), but ONLY while status is still
-- exactly 'uploaded' — once the office has moved it on (processing/editing/…),
-- the undo is refused so a contractor can't yank a shoot out from under an
-- in-flight edit. Ownership is re-derived server-side, same as 0053.
-- =============================================================

create or replace function unmark_field_shoot_uploaded(p_order_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
declare
  v_contractor uuid := current_contractor_id();
begin
  if v_contractor is null then
    raise exception 'not_a_contractor';
  end if;

  update orders
     set status = 'shooting', updated_at = now()
   where id = p_order_id
     and contractor_id = v_contractor
     and status = 'uploaded';   -- only while still just-uploaded, not yet processing

  if not found then
    raise exception 'order_not_revertable';
  end if;
end;
$$;

revoke all on function unmark_field_shoot_uploaded(uuid) from public, anon;
grant execute on function unmark_field_shoot_uploaded(uuid) to authenticated;
