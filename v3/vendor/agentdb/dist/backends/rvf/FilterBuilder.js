/**
 * FilterBuilder - Constructs RvfFilterExpr objects from a simple predicate DSL.
 *
 * Translates field-name-based predicates into field-ID-based RvfFilterExpr
 * objects that the @rufvector/rvf SDK expects.
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
/** Maximum number of filter expressions allowed (safety bound) */
const MAX_FILTER_EXPRS = 64;
/**
 * Maps field names to numeric IDs for RvfFilterExpr.
 *
 * Field IDs are assigned sequentially starting from 0.
 * The mapping is stable within a single FilterBuilder instance.
 */
export class FilterBuilder {
    fieldMap = new Map();
    nextFieldId = 0;
    exprs = [];
    /** Get or assign a numeric field ID for a field name */
    fieldId(name) {
        let id = this.fieldMap.get(name);
        if (id === undefined) {
            id = this.nextFieldId++;
            this.fieldMap.set(name, id);
        }
        return id;
    }
    /** Get the field name to ID mapping */
    getFieldMap() {
        return this.fieldMap;
    }
    /** Add an equality predicate */
    eq(field, value) {
        this.addExpr({ op: 'eq', fieldId: this.fieldId(field), value });
        return this;
    }
    /** Add a not-equal predicate */
    ne(field, value) {
        this.addExpr({ op: 'ne', fieldId: this.fieldId(field), value });
        return this;
    }
    /** Add a less-than predicate */
    lt(field, value) {
        this.addExpr({ op: 'lt', fieldId: this.fieldId(field), value });
        return this;
    }
    /** Add a less-than-or-equal predicate */
    le(field, value) {
        this.addExpr({ op: 'le', fieldId: this.fieldId(field), value });
        return this;
    }
    /** Add a greater-than predicate */
    gt(field, value) {
        this.addExpr({ op: 'gt', fieldId: this.fieldId(field), value });
        return this;
    }
    /** Add a greater-than-or-equal predicate */
    ge(field, value) {
        this.addExpr({ op: 'ge', fieldId: this.fieldId(field), value });
        return this;
    }
    /** Add an IN predicate (value in set) */
    in(field, values) {
        this.addExpr({ op: 'in', fieldId: this.fieldId(field), values });
        return this;
    }
    /** Add a range predicate (low <= value <= high) */
    range(field, low, high) {
        this.addExpr({ op: 'range', fieldId: this.fieldId(field), low, high });
        return this;
    }
    /** Add a NOT wrapper around an expression */
    not(expr) {
        this.addExpr({ op: 'not', expr });
        return this;
    }
    /** Build the final filter expression (AND of all added predicates) */
    build() {
        if (this.exprs.length === 0)
            return null;
        if (this.exprs.length === 1)
            return this.exprs[0];
        return { op: 'and', exprs: [...this.exprs] };
    }
    /** Reset the builder state */
    reset() {
        this.exprs = [];
        return this;
    }
    /**
     * Build an RvfFilterExpr from a simple predicate DSL object.
     *
     * Example:
     *   buildFilter({ status: 'active', score: { $gt: 0.5 } })
     *   => AND(eq(status, 'active'), gt(score, 0.5))
     */
    static buildFilter(predicates) {
        if (!predicates || typeof predicates !== 'object')
            return null;
        const keys = Object.keys(predicates);
        if (keys.length === 0)
            return null;
        const builder = new FilterBuilder();
        for (const field of keys) {
            if (builder.exprs.length >= MAX_FILTER_EXPRS) {
                throw new Error(`Filter expression count exceeds maximum of ${MAX_FILTER_EXPRS}`);
            }
            const val = predicates[field];
            if (val === null || val === undefined)
                continue;
            // Plain value => eq
            if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
                builder.eq(field, val);
                continue;
            }
            // Operator object
            if (typeof val === 'object') {
                const obj = val;
                if ('$eq' in obj)
                    builder.eq(field, obj.$eq);
                else if ('$ne' in obj)
                    builder.ne(field, obj.$ne);
                else if ('$lt' in obj)
                    builder.lt(field, obj.$lt);
                else if ('$le' in obj)
                    builder.le(field, obj.$le);
                else if ('$gt' in obj)
                    builder.gt(field, obj.$gt);
                else if ('$ge' in obj)
                    builder.ge(field, obj.$ge);
                else if ('$in' in obj)
                    builder.in(field, obj.$in);
                else if ('$range' in obj) {
                    const range = obj.$range;
                    builder.range(field, range[0], range[1]);
                }
            }
        }
        return builder.build();
    }
    addExpr(expr) {
        if (this.exprs.length >= MAX_FILTER_EXPRS) {
            throw new Error(`Filter expression count exceeds maximum of ${MAX_FILTER_EXPRS}`);
        }
        this.exprs.push(expr);
    }
}
//# sourceMappingURL=FilterBuilder.js.map