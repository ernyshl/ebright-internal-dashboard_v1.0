-- Find the view definition to see the underlying table
SELECT pg_get_viewdef('master_leads_powerbi'::regclass, true);
