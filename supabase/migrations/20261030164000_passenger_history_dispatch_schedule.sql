-- Schedule Railroad dispatcher; routine makes no HTTP request until private credentials are configured.
select cron.schedule('pj_passenger_history_dispatch', '*/2 * * * *', 'select public.pj_passenger_dispatch_pending();');
