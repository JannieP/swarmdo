#!/usr/bin/env node
/**
 * Rufflo CLI - Umbrella entry point
 * Proxies to @rufflo/cli bin for cross-platform compatibility.
 */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', 'v3', '@rufflo', 'cli', 'bin', 'cli.js');
await import(pathToFileURL(cliPath).href);
