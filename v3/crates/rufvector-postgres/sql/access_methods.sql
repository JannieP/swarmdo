-- ============================================================================
-- HNSW Access Method
-- ============================================================================

-- HNSW Access Method Handler
CREATE OR REPLACE FUNCTION hnsw_handler(internal)
RETURNS index_am_handler
AS 'MODULE_PATHNAME', 'hnsw_handler_wrapper'
LANGUAGE C STRICT;

-- Create HNSW Access Method
CREATE ACCESS METHOD ruhnsw TYPE INDEX HANDLER hnsw_handler;

-- ============================================================================
-- Operator Classes for HNSW
-- ============================================================================

-- HNSW Operator Class for L2 (Euclidean) distance
CREATE OPERATOR CLASS rufvector_l2_ops
    DEFAULT FOR TYPE rufvector USING ruhnsw AS
    OPERATOR 1 <-> (rufvector, rufvector) FOR ORDER BY float_ops,
    FUNCTION 1 rufvector_l2_distance(rufvector, rufvector);

COMMENT ON OPERATOR CLASS rufvector_l2_ops USING ruhnsw IS
'rufvector HNSW operator class for L2/Euclidean distance';

-- HNSW Operator Class for Cosine distance
CREATE OPERATOR CLASS rufvector_cosine_ops
    FOR TYPE rufvector USING ruhnsw AS
    OPERATOR 1 <=> (rufvector, rufvector) FOR ORDER BY float_ops,
    FUNCTION 1 rufvector_cosine_distance(rufvector, rufvector);

COMMENT ON OPERATOR CLASS rufvector_cosine_ops USING ruhnsw IS
'rufvector HNSW operator class for cosine distance';

-- HNSW Operator Class for Inner Product
CREATE OPERATOR CLASS rufvector_ip_ops
    FOR TYPE rufvector USING ruhnsw AS
    OPERATOR 1 <#> (rufvector, rufvector) FOR ORDER BY float_ops,
    FUNCTION 1 rufvector_inner_product(rufvector, rufvector);

COMMENT ON OPERATOR CLASS rufvector_ip_ops USING ruhnsw IS
'rufvector HNSW operator class for inner product (max similarity)';
