#![no_main]

use libfuzzer_sys::fuzz_target;
use swarmvector_graph::cypher::parse_cypher;

fuzz_target!(|data: &str| {
    // Feed arbitrary strings into the Cypher parser.
    // The parser must never panic -- it should return Ok or Err gracefully.
    let _ = parse_cypher(data);

    // Also exercise the lexer independently: tokenize can fail on invalid
    // input but must not panic.
    let _ = swarmvector_graph::cypher::lexer::tokenize(data);

    // If the parser succeeds, round-trip through the semantic analyzer
    // to exercise that code path as well.
    if let Ok(query) = parse_cypher(data) {
        let mut analyzer = swarmvector_graph::cypher::SemanticAnalyzer::new();
        let _ = analyzer.analyze_query(&query);
    }
});
