-- Several foods per meal slot.
--
-- Until now diet_plan_meals.order_index was the slot identity: diet_plans.swaps
-- is keyed by it and week_structure.slotLabels is indexed by it, and every slot
-- held exactly one meal. From this migration on:
--
--   slot_index  = the slot (position in week_structure.slotLabels, key of swaps)
--   order_index = the food's position within its slot
--
-- Existing rows are one food per slot, so slot_index = order_index for them.
-- Apply with: npx supabase db query --linked -f supabase/migrations/20260905050000_diet_slot_index.sql

ALTER TABLE public.diet_plan_meals ADD COLUMN IF NOT EXISTS slot_index integer;

UPDATE public.diet_plan_meals SET slot_index = order_index WHERE slot_index IS NULL;

ALTER TABLE public.diet_plan_meals ALTER COLUMN slot_index SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS diet_plan_meals_plan_slot_idx
  ON public.diet_plan_meals (diet_plan_id, slot_index);
