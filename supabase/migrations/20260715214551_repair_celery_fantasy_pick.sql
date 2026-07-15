update public.snacks
set category='Vegetables',updated_at=now()
where normalized_name='celery, raw'
  and category='Other'
  and source_type='usda';

update public.fantasy_picks pick
set category='Vegetables'
from public.snacks snack
where pick.snack_id=snack.id
  and snack.normalized_name='celery, raw'
  and snack.source_type='usda'
  and pick.category='Other'
  and not exists (
    select 1 from public.fantasy_picks other
    where other.season_id=pick.season_id and other.user_id=pick.user_id and other.category='Vegetables'
  );

update public.fantasy_roster_slots slot
set category='Vegetables',effective_to=null
from public.snacks snack
where slot.snack_id=snack.id
  and snack.normalized_name='celery, raw'
  and snack.source_type='usda'
  and slot.category='Other'
  and not exists (
    select 1 from public.fantasy_roster_slots active
    where active.season_id=slot.season_id and active.user_id=slot.user_id and active.effective_to is null
      and public.fantasy_roster_category(active.category)='Vegetable'
  );

update public.fantasy_seasons season
set current_pick=season.current_pick+1,
  pick_deadline=public.fantasy_add_business_hours(now(),3)
where season.status='drafting'
  and exists (
    select 1
    from public.fantasy_roster_slots slot
    join public.snacks snack on snack.id=slot.snack_id
    where slot.season_id=season.id
      and slot.user_id=public.fantasy_current_picker(season.id,season.current_pick)
      and slot.effective_to is null
      and snack.normalized_name='celery, raw'
      and snack.source_type='usda'
  )
  and (
    select count(*)
    from public.fantasy_roster_slots slot
    where slot.season_id=season.id
      and slot.user_id=public.fantasy_current_picker(season.id,season.current_pick)
      and slot.effective_to is null
      and public.fantasy_roster_category(slot.category) is not null
  )=5;
