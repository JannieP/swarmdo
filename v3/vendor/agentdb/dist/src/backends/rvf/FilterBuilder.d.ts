/**
 * FilterBuilder - Constructs RvfFilterExpr objects from a simple predicate DSL.
 *
 * Translates field-name-based predicates into field-ID-based RvfFilterExpr
 * objects that the @swarmvector/rvf SDK expects.
 *
 * Usage:
 *   const filter = new FilterBuilder()
 *     .eq('status', 'active')
 *     .gt('score', 0.5)
 *     .build();    // => RvfFilterExpr (AND of all predicates)
 *
 *   // Or build directly:
 *   FilterBuilder.buildFilter({ status: 'active', score: { $gt: 0.5 } });
 */
/** Re-export filter types from @swarmvector/rvf for convenience */
export type RvfFilterValue = number | string | boolean;
export type RvfFilterExpr = {
    op: 'eq';
    fieldId: number;
    value: RvfFilterValue;
} | {
    op: 'ne';
    fieldId: number;
    value: RvfFilterValue;
} | {
    op: 'lt';
    fieldId: number;
    value: RvfFilterValue;
} | {
    op: 'le';
    fieldId: number;
    value: RvfFilterValue;
} | {
    op: 'gt';
    fieldId: number;
    value: RvfFilterValue;
} | {
    op: 'ge';
    fieldId: number;
    value: RvfFilterValue;
} | {
    op: 'in';
    fieldId: number;
    values: RvfFilterValue[];
} | {
    op: 'range';
    fieldId: number;
    low: RvfFilterValue;
    high: RvfFilterValue;
} | {
    op: 'and';
    exprs: RvfFilterExpr[];
} | {
    op: 'or';
    exprs: RvfFilterExpr[];
} | {
    op: 'not';
    expr: RvfFilterExpr;
};
/**
 * Simple predicate DSL value: either a plain value (eq), or an operator object.
 *
 * Examples:
 *   'active'          => eq('field', 'active')
 *   { $gt: 5 }        => gt('field', 5)
 *   { $in: [1,2,3] }  => in('field', [1,2,3])
 *   { $range: [0,10]} => range('field', 0, 10)
 *   { $ne: false }    => ne('field', false)
 */
export type PredicateValue = RvfFilterValue | {
    $eq?: RvfFilterValue;
} | {
    $ne?: RvfFilterValue;
} | {
    $lt?: RvfFilterValue;
} | {
    $le?: RvfFilterValue;
} | {
    $gt?: RvfFilterValue;
} | {
    $ge?: RvfFilterValue;
} | {
    $in?: RvfFilterValue[];
} | {
    $range?: [RvfFilterValue, RvfFilterValue];
};
/** Predicate DSL: field name => predicate value */
export type FilterPredicate = Record<string, PredicateValue>;
/**
 * Maps field names to numeric IDs for RvfFilterExpr.
 *
 * Field IDs are assigned sequentially starting from 0.
 * The mapping is stable within a single FilterBuilder instance.
 */
export declare class FilterBuilder {
    private fieldMap;
    private nextFieldId;
    private exprs;
    /** Get or assign a numeric field ID for a field name */
    fieldId(name: string): number;
    /** Get the field name to ID mapping */
    getFieldMap(): ReadonlyMap<string, number>;
    /** Add an equality predicate */
    eq(field: string, value: RvfFilterValue): this;
    /** Add a not-equal predicate */
    ne(field: string, value: RvfFilterValue): this;
    /** Add a less-than predicate */
    lt(field: string, value: RvfFilterValue): this;
    /** Add a less-than-or-equal predicate */
    le(field: string, value: RvfFilterValue): this;
    /** Add a greater-than predicate */
    gt(field: string, value: RvfFilterValue): this;
    /** Add a greater-than-or-equal predicate */
    ge(field: string, value: RvfFilterValue): this;
    /** Add an IN predicate (value in set) */
    in(field: string, values: RvfFilterValue[]): this;
    /** Add a range predicate (low <= value <= high) */
    range(field: string, low: RvfFilterValue, high: RvfFilterValue): this;
    /** Add a NOT wrapper around an expression */
    not(expr: RvfFilterExpr): this;
    /** Build the final filter expression (AND of all added predicates) */
    build(): RvfFilterExpr | null;
    /** Reset the builder state */
    reset(): this;
    /**
     * Build an RvfFilterExpr from a simple predicate DSL object.
     *
     * Example:
     *   buildFilter({ status: 'active', score: { $gt: 0.5 } })
     *   => AND(eq(status, 'active'), gt(score, 0.5))
     */
    static buildFilter(predicates: FilterPredicate): RvfFilterExpr | null;
    private addExpr;
}
//# sourceMappingURL=FilterBuilder.d.ts.map