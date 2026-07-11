import { describe, it, expect } from 'vitest';
import {
  RECIPES,
  findRecipe,
  recipeNames,
  hasRecipe,
  applyRecipe,
  applyRecipes,
  type HookRecipe,
} from '../src/hooks-recipe/recipe.ts';

const notifyDone = findRecipe('notify-done')!;

describe('hooks-recipe: catalog', () => {
  it('exposes the recipes by name', () => {
    expect(recipeNames()).toContain('notify-done');
    expect(recipeNames()).toContain('notify-input');
    expect(recipeNames()).toContain('memory-inject');
    expect(findRecipe('NOTIFY-DONE')!.event).toBe('Stop');
    expect(findRecipe('memory-inject')!.event).toBe('UserPromptSubmit');
    expect(findRecipe('nope')).toBeUndefined();
  });
  it('every recipe is a swarmdo hooks command with the required fields', () => {
    for (const r of RECIPES) {
      expect(r.command).toMatch(/^swarmdo hooks /);
      expect(r.name && r.event && r.title && r.description).toBeTruthy();
    }
  });
});

describe('hooks-recipe: hasRecipe', () => {
  it('is false on empty/absent settings', () => {
    expect(hasRecipe({}, notifyDone)).toBe(false);
    expect(hasRecipe(null, notifyDone)).toBe(false);
    expect(hasRecipe({ hooks: { Stop: [] } }, notifyDone)).toBe(false);
  });
  it('is true when the exact command is wired to the event', () => {
    const s = { hooks: { Stop: [{ hooks: [{ type: 'command', command: notifyDone.command }] }] } };
    expect(hasRecipe(s, notifyDone)).toBe(true);
  });
  it('does not treat a same-command entry under a DIFFERENT matcher as installed', () => {
    const existing = { hooks: { PostToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'fmt' }] }] } };
    const recipe = { name: 'fmt-write', event: 'PostToolUse', matcher: 'Edit|Write', command: 'fmt', title: '', description: '' } as any;
    expect(hasRecipe(existing, recipe)).toBe(false);            // Edit|Write binding doesn't exist yet
    const { settings, changed } = applyRecipe(existing, recipe);
    expect(changed).toBe(true);
    expect((settings.hooks as any).PostToolUse).toHaveLength(2); // it gets wired, not skipped
  });
});

describe('hooks-recipe: applyRecipe', () => {
  it('adds a Stop hook to empty settings', () => {
    const { settings, changed } = applyRecipe({}, notifyDone);
    expect(changed).toBe(true);
    const entry = (settings.hooks as any).Stop[0];
    expect(entry.hooks[0]).toEqual({ type: 'command', command: notifyDone.command });
    expect(entry.matcher).toBeUndefined(); // Stop has no matcher
  });

  it('is idempotent — re-applying does not change or duplicate', () => {
    const once = applyRecipe({}, notifyDone).settings;
    const twice = applyRecipe(once, notifyDone);
    expect(twice.changed).toBe(false);
    expect((twice.settings.hooks as any).Stop).toHaveLength(1);
  });

  it('preserves existing settings and other hooks (additive)', () => {
    const existing = {
      model: 'opus',
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'guard' }] }] },
    };
    const { settings } = applyRecipe(existing, notifyDone);
    expect(settings.model).toBe('opus');
    expect((settings.hooks as any).PreToolUse).toHaveLength(1);
    expect((settings.hooks as any).Stop).toHaveLength(1);
  });

  it('appends to an existing event array without clobbering', () => {
    const existing = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'other' }] }] } };
    const { settings } = applyRecipe(existing, notifyDone);
    expect((settings.hooks as any).Stop).toHaveLength(2);
    expect((settings.hooks as any).Stop[0].hooks[0].command).toBe('other');
  });

  it('does not mutate the input object', () => {
    const input = { hooks: {} };
    const snapshot = JSON.stringify(input);
    applyRecipe(input, notifyDone);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('includes a matcher for tool-event recipes', () => {
    const toolRecipe: HookRecipe = { name: 't', event: 'PostToolUse', matcher: 'Edit|Write', command: 'fmt', title: '', description: '' };
    const { settings } = applyRecipe({}, toolRecipe);
    expect((settings.hooks as any).PostToolUse[0].matcher).toBe('Edit|Write');
  });

  it('wires the memory-inject recipe as a matcher-less UserPromptSubmit hook, idempotently', () => {
    const memInject = findRecipe('memory-inject')!;
    const { settings, changed } = applyRecipe({}, memInject);
    expect(changed).toBe(true);
    const entry = (settings.hooks as any).UserPromptSubmit[0];
    expect(entry.matcher).toBeUndefined(); // UserPromptSubmit takes no matcher
    expect(entry.hooks[0]).toEqual({ type: 'command', command: 'swarmdo hooks memory-inject' });
    expect(hasRecipe(settings, memInject)).toBe(true);
    expect(applyRecipe(settings, memInject).changed).toBe(false); // idempotent
  });
});

describe('hooks-recipe: applyRecipes', () => {
  it('installs all and reports installed vs skipped', () => {
    const first = applyRecipes({}, RECIPES);
    expect(first.installed.sort()).toEqual(recipeNames().sort());
    expect(first.skipped).toEqual([]);
    // re-running is fully idempotent
    const again = applyRecipes(first.settings, RECIPES);
    expect(again.installed).toEqual([]);
    expect(again.skipped.sort()).toEqual(recipeNames().sort());
  });
});
