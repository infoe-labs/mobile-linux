import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeDraft } from '../src/terminal/CompletionEngine.ts';
test('completion uses supplied real guest names and never executes suggestions', () => {
  assert.deepEqual(completeDraft('un', ['uname', 'uptime'], []), ['uname']);
  assert(completeDraft('ls -', [], []).includes('ls -la'));
  assert(
    completeDraft(
      'cat /root/n',
      [],
      [{ name: 'notes', type: 'directory', mode: '700', size: 0 }],
    ).includes('cat /root/notes/'),
  );
  assert.equal(completeDraft('ec', [], [], ['echo safe'])[0], 'echo safe');
  assert.deepEqual(completeDraft('echo\nrm', [], []), []);
});
import { safeInsertion, quotePath } from '../src/terminal/input.ts';
test('insertion strips terminal controls and filenames are shell-quoted', () => {
  assert.equal(safeInsertion('echo hello\r\n\x1b\x03\0world'), 'echo hello  world');
  assert.equal(quotePath("/root/a'; echo bad"), "'/root/a'\\''; echo bad'");
  assert(
    completeDraft(
      'cat a',
      [],
      [{ name: 'a; touch bad', type: 'regular file', mode: '644', size: 0 }],
    ).includes("cat 'a; touch bad'"),
  );
});
