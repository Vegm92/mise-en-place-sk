BEGIN TRANSACTION READ ONLY;

SELECT json_build_object(
	'notification_id', n.id,
	'source',          COALESCE(n.payload->>'source', 'fuzzy'),
	'description',     n.payload->>'description',
	'candidate_name',  n.payload->>'candidateName',
	'baseline_score',  (n.payload->>'score')::float,
	'label',           CASE
		WHEN n.payload ? 'candidateProductId'
			THEN (a.product_id = (n.payload->>'candidateProductId')::int)::int
		ELSE (p.canonical_name = n.payload->>'candidateName')::int
	END
)
FROM system_notifications n
JOIN product_aliases a
	ON a.restaurant_id = n.restaurant_id
	AND a.raw_key = mep_norm_key(n.payload->>'description')
JOIN products p
	ON p.id = a.product_id
WHERE n.notification_type = 'product_suggestion'
	AND n.status = 'sent'
	AND a.source = 'user'
	AND a.confirmed_at IS NOT NULL
	AND n.payload->>'candidateName' IS NOT NULL
	AND n.payload->>'score' IS NOT NULL
ORDER BY n.id;

ROLLBACK;
