-- Find the real table name that master_leads_powerbi view is based on
SELECT table_schema, table_name 
FROM information_schema.view_table_usage 
WHERE table_schema = 'public' 
  AND view_name = 'master_leads_powerbi';
