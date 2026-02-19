-- This will update all clean_branch values containing "Online" to just "Online"
UPDATE master_leads_powerbi
SET clean_branch = 'Online'
WHERE LOWER(TRIM(clean_branch)) LIKE '%online%';

-- Verify the change
SELECT DISTINCT clean_branch as unique_branches
FROM master_leads_powerbi
WHERE LOWER(TRIM(clean_branch)) LIKE '%online%'
ORDER BY clean_branch;
