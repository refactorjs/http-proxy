/*
  examples-test.js: Test to run all the examples

  Copyright (c) 2013 - 2016 Charlie Robbins, Jarrett Cruger & the Contributors.

*/
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const rootDir = join(__dirname, '..')
const examplesDir = join(rootDir, 'examples');

describe('http-proxy examples', function () {
    describe('Before testing examples', () => {
        it('should have installed dependencies', async () => {
            let files = await readdir(examplesDir);
            if (files.indexOf('node_modules') === -1) {
                await new Promise((resolve, reject) => {
                    const child = spawn('npm', ['install', '-f', '--save=false'], {
                        cwd: examplesDir,
                    });
                    child.on('exit', function (code) {
                        return code ? reject(new Error('npm install exited with non-zero exit code')) : resolve();
                    });
                });
            }
            files = await readdir(examplesDir);
            if (files.indexOf('node_modules') === -1) {
                throw new Error('node_modules does not exist after install');
            }
        }, 30 * 1000);
    });

    describe('Requiring all the examples', () => {
        it('should have no errors', async () => {
            for (const dir of ['balancer', 'http', 'middleware', 'websocket']) {
                const files = await readdir(join(rootDir, 'examples', dir));
                for (let file of files) {
                    let example;
                    try {
                        // Await the imported module promise
                        example = await import(join(examplesDir, dir, file));
                    } catch (error) {
                        // Fail the test if import throws an error
                        throw new Error(`Failed to import ${join(examplesDir, dir, file)}: ${error}`);
                    }
                    expect(typeof example).toBe('object');
                    expect(example).not.toBeNull();
                    expect(example).not.toBeUndefined();
                }
            }
        });
    });
});
