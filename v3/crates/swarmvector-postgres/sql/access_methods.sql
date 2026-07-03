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
CREATE OPERATOR CLASS swarmvector_l2_ops
    DEFAULT FOR TYPE swarmvector USING ruhnsw AS
    OPERATOR 1 <-> (swarmvector, swarmvector) FOR ORDER BY float_ops,
    FUNCTION 1 swarmvector_l2_distance(swarmvector, swarmvector);

COMMENT ON OPERATOR CLASS swarmvector_l2_ops USING ruhnsw IS
'swarmvector HNSW operator class for L2/Euclidean distance';

-- HNSW Operator Class for Cosine distance
CREATE OPERATOR CLASS swarmvector_cosine_ops
    FOR TYPE swarmvector USING ruhnsw AS
    OPERATOR 1 <=> (swarmvector, swarmvector) FOR ORDER BY float_ops,
    FUNCTION 1 swarmvector_cosine_distance(swarmvector, swarmvector);

COMMENT ON OPERATOR CLASS swarmvector_cosine_ops USING ruhnsw IS
'swarmvector HNSW operator class for cosine distance';

-- HNSW Operator Class for Inner Product
CREATE OPERATOR CLASS swarmvector_ip_ops
    FOR TYPE swarmvector USING ruhnsw AS
    OPERATOR 1 <#> (swarmvector, swarmvector) FOR ORDER BY float_ops,
    FUNCTION 1 swarmvector_inner_product(swarmvector, swarmvector);

COMMENT ON OPERATOR CLASS swarmvector_ip_ops USING ruhnsw IS
'swarmvector HNSW operator class for inner product (max similarity)';
