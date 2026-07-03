#!/usr/bin/env node
/**
 * Swarmdo CLI - Umbrella entry point
 * Proxies to @swarmdo/cli bin for cross-platform compatibility.
 */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', 'v3', '@swarmdo', 'cli', 'bin', 'cli.js');
await import(pathToFileURL(cliPath).href);
