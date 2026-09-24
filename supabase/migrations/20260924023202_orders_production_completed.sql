-- Independent production marker; existing status, payment and inventory stay intact.
ALTER TABLE public.orders
  ADD COLUMN production_completed BOOLEAN NOT NULL DEFAULT FALSE;
