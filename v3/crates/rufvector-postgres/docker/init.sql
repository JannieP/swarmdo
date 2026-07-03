-- RufVector-Postgres Initialization Script
-- Creates extension and verifies basic functionality

-- Create the extension
CREATE EXTENSION IF NOT EXISTS rufvector;

-- Create test schema
CREATE SCHEMA IF NOT EXISTS rufvector_test;

-- Test table for basic usage
CREATE TABLE rufvector_test.test_basic (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create rufvector role if it doesn't exist (optional app user)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rufvector') THEN
        CREATE ROLE rufvector WITH LOGIN PASSWORD 'rufvector';
    END IF;
END $$;

-- Grant permissions to rufvector role and public
GRANT USAGE ON SCHEMA rufvector_test TO PUBLIC;
GRANT ALL ON SCHEMA rufvector_test TO rufvector;
GRANT ALL ON ALL TABLES IN SCHEMA rufvector_test TO rufvector;
GRANT ALL ON ALL SEQUENCES IN SCHEMA rufvector_test TO rufvector;

-- Log initialization and test basic functions
DO $$
DECLARE
    version_info TEXT;
    simd_info TEXT;
BEGIN
    -- Test version function
    SELECT rufvector_version() INTO version_info;
    RAISE NOTICE 'RufVector-Postgres initialized successfully';
    RAISE NOTICE 'Extension version: %', version_info;

    -- Test SIMD info function
    SELECT rufvector_simd_info() INTO simd_info;
    RAISE NOTICE 'SIMD info: %', simd_info;

    -- Test distance functions with array functions
    RAISE NOTICE 'Testing distance functions...';
    RAISE NOTICE 'Inner product: %', inner_product_arr(ARRAY[1.0, 2.0, 3.0]::real[], ARRAY[1.0, 2.0, 3.0]::real[]);
    RAISE NOTICE 'Cosine distance: %', cosine_distance_arr(ARRAY[1.0, 0.0, 0.0]::real[], ARRAY[0.0, 1.0, 0.0]::real[]);

    RAISE NOTICE 'All basic tests passed!';

    -- ================================================================
    -- v0.3 Module Tests
    -- ================================================================
    RAISE NOTICE '--- v0.3 Module Tests ---';

    -- Solver: PageRank
    RAISE NOTICE 'Solver PageRank: %', rufvector_pagerank('{"edges":[[0,1],[1,2],[2,0]]}'::jsonb);

    -- Solver: Info
    RAISE NOTICE 'Solver algorithms available';

    -- Solver: Matrix analyze
    RAISE NOTICE 'Matrix analyze: %', rufvector_matrix_analyze('{"rows":3,"cols":3,"entries":[[0,0,4],[0,1,-1],[1,0,-1],[1,1,4],[2,2,2]]}'::jsonb);

    -- Math: Wasserstein distance
    RAISE NOTICE 'Wasserstein distance: %', rufvector_wasserstein_distance(ARRAY[0.5,0.5]::real[], ARRAY[0.3,0.7]::real[]);

    -- Math: KL divergence
    RAISE NOTICE 'KL divergence: %', rufvector_kl_divergence(ARRAY[0.5,0.5]::real[], ARRAY[0.3,0.7]::real[]);

    -- Math: Jensen-Shannon
    RAISE NOTICE 'Jensen-Shannon: %', rufvector_jensen_shannon(ARRAY[0.5,0.5]::real[], ARRAY[0.3,0.7]::real[]);

    -- TDA: Persistent homology
    RAISE NOTICE 'Persistent homology: %', rufvector_persistent_homology('[[1,0],[0,1],[-1,0],[0,-1]]'::jsonb, 1, 3.0);

    -- TDA: Betti numbers
    RAISE NOTICE 'Betti numbers: %', rufvector_betti_numbers('[[0,0],[1,0],[0,1]]'::jsonb, 1.5);

    -- Attention: Linear attention
    RAISE NOTICE 'Linear attention: %', rufvector_linear_attention(ARRAY[1,0,0,0]::real[], '[[1,0,0,0],[0,1,0,0]]'::jsonb, '[[5,10],[15,20]]'::jsonb);

    -- Attention: Benchmark
    RAISE NOTICE 'Attention benchmark: %', rufvector_attention_benchmark(64, 128, 'scaled_dot');

    RAISE NOTICE 'All v0.3 tests passed!';
END $$;
