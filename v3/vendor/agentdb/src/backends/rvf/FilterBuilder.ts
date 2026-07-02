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

/** Re-export filter types from @rufvector/rvf for convenience */
export type RvfFilterValue = number | string | boolean;

export type RvfFilterExpr =
  | { op: 'eq'; fieldId: number; value: RvfFilterValue }
  | { op: 'ne'; fieldId: number; value: RvfFilterValue }
  | { op: 'lt'; fieldId: number; value: RvfFilterValue }
  | { op: 'le'; fieldId: number; value: RvfFilterValue }
  | { op: 'gt'; fieldId: number; value: RvfFilterValue }
  | { op: 'ge'; fieldId: number; value: RvfFilterValue }
  | { op: 'in'; fieldId: number; values: RvfFilterValue[] }
  | { op: 'range'; fieldId: number; low: RvfFilterValue; high: RvfFilterValue }
  | { op: 'and'; exprs: RvfFilterExpr[] }
  | { op: 'or'; exprs: RvfFilterExpr[] }
  | { op: 'not'; expr: RvfFilterExpr };

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
export type PredicateValue =
  | RvfFilterValue
  | { $eq?: RvfFilterValue }
  | { $ne?: RvfFilterValue }
  | { $lt?: RvfFilterValue }
  | { $le?: RvfFilterValue }
  | { $gt?: RvfFilterValue }
  | { $ge?: RvfFilterValue }
  | { $in?: RvfFilterValue[] }
  | { $range?: [RvfFilterValue, RvfFilterValue] };

/** Predicate DSL: field name => predicate value */
export type FilterPredicate = Record<string, PredicateValue>;

/** Maximum number of filter expressions allowed (safety bound) */
const MAX_FILTER_EXPRS = 64;

/**
 * Maps field names to numeric IDs for RvfFilterExpr.
 *
 * Field IDs are assigned sequentially starting from 0.
 * The mapping is stable within a single FilterBuilder instance.
 */
export class FilterBuilder {
  private fieldMap: Map<string, number> = new Map();
  private nextFieldId = 0;
  private exprs: RvfFilterExpr[] = [];

  /** Get or assign a numeric field ID for a field name */
  fieldId(name: string): number {
    let id = this.fieldMap.get(name);
    if (id === undefined) {
      id = this.nextFieldId++;
      this.fieldMap.set(name, id);
    }
    return id;
  }

  /** Get the field name to ID mapping */
  getFieldMap(): ReadonlyMap<string, number> {
    return this.fieldMap;
  }

  /** Add an equality predicate */
  eq(field: string, value: RvfFilterValue): this {
    this.addExpr({ op: 'eq', fieldId: this.fieldId(field), value });
    return this;
  }

  /** Add a not-equal predicate */
  ne(field: string, value: RvfFilterValue): this {
    this.addExpr({ op: 'ne', fieldId: this.fieldId(field), value });
    return this;
  }

  /** Add a less-than predicate */
  lt(field: string, value: RvfFilterValue): this {
    this.addExpr({ op: 'lt', fieldId: this.fieldId(field), value });
    return this;
  }

  /** Add a less-than-or-equal predicate */
  le(field: string, value: RvfFilterValue): this {
    this.addExpr({ op: 'le', fieldId: this.fieldId(field), value });
    return this;
  }

  /** Add a greater-than predicate */
  gt(field: string, value: RvfFilterValue): this {
    this.addExpr({ op: 'gt', fieldId: this.fieldId(field), value });
    return this;
  }

  /** Add a greater-than-or-equal predicate */
  ge(field: string, value: RvfFilterValue): this {
    this.addExpr({ op: 'ge', fieldId: this.fieldId(field), value });
    return this;
  }

  /** Add an IN predicate (value in set) */
  in(field: string, values: RvfFilterValue[]): this {
    this.addExpr({ op: 'in', fieldId: this.fieldId(field), values });
    return this;
  }

  /** Add a range predicate (low <= value <= high) */
  range(field: string, low: RvfFilterValue, high: RvfFilterValue): this {
    this.addExpr({ op: 'range', fieldId: this.fieldId(field), low, high });
    return this;
  }

  /** Add a NOT wrapper around an expression */
  not(expr: RvfFilterExpr): this {
    this.addExpr({ op: 'not', expr });
    return this;
  }

  /** Build the final filter expression (AND of all added predicates) */
  build(): RvfFilterExpr | null {
    if (this.exprs.length === 0) return null;
    if (this.exprs.length === 1) return this.exprs[0];
    return { op: 'and', exprs: [...this.exprs] };
  }

  /** Reset the builder state */
  reset(): this {
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
  static buildFilter(predicates: FilterPredicate): RvfFilterExpr | null {
    if (!predicates || typeof predicates !== 'object') return null;

    const keys = Object.keys(predicates);
    if (keys.length === 0) return null;

    const builder = new FilterBuilder();

    for (const field of keys) {
      if (builder.exprs.length >= MAX_FILTER_EXPRS) {
        throw new Error(`Filter expression count exceeds maximum of ${MAX_FILTER_EXPRS}`);
      }

      const val = predicates[field];

      if (val === null || val === undefined) continue;

      // Plain value => eq
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        builder.eq(field, val);
        continue;
      }

      // Operator object
      if (typeof val === 'object') {
        const obj = val as Record<string, unknown>;
        if ('$eq' in obj) builder.eq(field, obj.$eq as RvfFilterValue);
        else if ('$ne' in obj) builder.ne(field, obj.$ne as RvfFilterValue);
        else if ('$lt' in obj) builder.lt(field, obj.$lt as RvfFilterValue);
        else if ('$le' in obj) builder.le(field, obj.$le as RvfFilterValue);
        else if ('$gt' in obj) builder.gt(field, obj.$gt as RvfFilterValue);
        else if ('$ge' in obj) builder.ge(field, obj.$ge as RvfFilterValue);
        else if ('$in' in obj) builder.in(field, obj.$in as RvfFilterValue[]);
        else if ('$range' in obj) {
          const range = obj.$range as [RvfFilterValue, RvfFilterValue];
          builder.range(field, range[0], range[1]);
        }
      }
    }

    return builder.build();
  }

  private addExpr(expr: RvfFilterExpr): void {
    if (this.exprs.length >= MAX_FILTER_EXPRS) {
      throw new Error(`Filter expression count exceeds maximum of ${MAX_FILTER_EXPRS}`);
    }
    this.exprs.push(expr);
  }
}
