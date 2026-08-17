SELECT id, restaurant_id, invoice_number, invoice_date, due_date
FROM invoices
WHERE (invoice_date IS NOT NULL AND invoice_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
   OR (due_date     IS NOT NULL AND due_date     !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
ORDER BY id;

SELECT 'category_budgets' AS tbl, month FROM category_budgets WHERE month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
UNION ALL
SELECT 'monthly_usage',    month FROM monthly_usage    WHERE month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
UNION ALL
SELECT 'mrr_snapshots',    month FROM mrr_snapshots    WHERE month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
UNION ALL
SELECT 'acquisition_costs', month FROM acquisition_costs WHERE month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$';
