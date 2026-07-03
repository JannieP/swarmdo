-- ============================================================================
-- Embedding Generation Functions
-- ============================================================================

-- Generate embedding from text using default or specified model
CREATE OR REPLACE FUNCTION swarmvector_embed(text text, model_name text DEFAULT 'all-MiniLM-L6-v2')
RETURNS real[]
AS 'MODULE_PATHNAME', 'swarmvector_embed_wrapper'
LANGUAGE C IMMUTABLE STRICT PARALLEL SAFE;

-- Generate embeddings for multiple texts in batch
CREATE OR REPLACE FUNCTION swarmvector_embed_batch(texts text[], model_name text DEFAULT 'all-MiniLM-L6-v2')
RETURNS real[][]
AS 'MODULE_PATHNAME', 'swarmvector_embed_batch_wrapper'
LANGUAGE C IMMUTABLE STRICT PARALLEL SAFE;

-- List all available embedding models
CREATE OR REPLACE FUNCTION swarmvector_embedding_models()
RETURNS TABLE (
    model_name text,
    dimensions integer,
    description text,
    is_loaded boolean
)
AS 'MODULE_PATHNAME', 'swarmvector_embedding_models_wrapper'
LANGUAGE C IMMUTABLE STRICT;

-- Load embedding model into memory
CREATE OR REPLACE FUNCTION swarmvector_load_model(model_name text)
RETURNS boolean
AS 'MODULE_PATHNAME', 'swarmvector_load_model_wrapper'
LANGUAGE C STRICT;

-- Unload embedding model from memory
CREATE OR REPLACE FUNCTION swarmvector_unload_model(model_name text)
RETURNS boolean
AS 'MODULE_PATHNAME', 'swarmvector_unload_model_wrapper'
LANGUAGE C STRICT;

-- Get information about a specific model
CREATE OR REPLACE FUNCTION swarmvector_model_info(model_name text)
RETURNS jsonb
AS 'MODULE_PATHNAME', 'swarmvector_model_info_wrapper'
LANGUAGE C IMMUTABLE STRICT;

-- Set default embedding model
CREATE OR REPLACE FUNCTION swarmvector_set_default_model(model_name text)
RETURNS boolean
AS 'MODULE_PATHNAME', 'swarmvector_set_default_model_wrapper'
LANGUAGE C STRICT;

-- Get current default embedding model
CREATE OR REPLACE FUNCTION swarmvector_default_model()
RETURNS text
AS 'MODULE_PATHNAME', 'swarmvector_default_model_wrapper'
LANGUAGE C IMMUTABLE STRICT;

-- Get embedding generation statistics
CREATE OR REPLACE FUNCTION swarmvector_embedding_stats()
RETURNS jsonb
AS 'MODULE_PATHNAME', 'swarmvector_embedding_stats_wrapper'
LANGUAGE C IMMUTABLE STRICT;

-- Get dimensions for a specific model
CREATE OR REPLACE FUNCTION swarmvector_embedding_dims(model_name text)
RETURNS integer
AS 'MODULE_PATHNAME', 'swarmvector_embedding_dims_wrapper'
LANGUAGE C IMMUTABLE STRICT PARALLEL SAFE;
