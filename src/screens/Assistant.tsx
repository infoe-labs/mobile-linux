import { useState } from 'react';
import { vm } from '../vm/V86Controller';
import { ai, model } from '../ai/AIManager';
import { terminal } from '../terminal/TerminalController';
import type { Act } from '../app/actions';
export default function Assistant({ act }: { act: Act }) {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState('Suggest a command');
  return (
    <div className="panel-body">
      <div className="eyebrow">OPTIONAL · ON DEVICE</div>
      <h3>A little help, locally.</h3>
      <p>
        Linux works without AI. This experimental 135M model can produce incorrect commands. Review
        every suggestion.
      </p>
      <article className="model">
        <strong>SmolLM2 · 135M · q4</strong>
        <p>
          {model.license} · {model.download}
          <br />
          {model.storage}
        </p>
        <p className="muted">
          Single-thread WASM inference in a separate worker. Model downloads contact Hugging Face
          only after you choose Load. No prompts are sent.
        </p>
        <a
          href="https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct/blob/main/LICENSE"
          target="_blank"
          rel="noreferrer"
        >
          Model license
        </a>
        <div className="row">
          <button disabled={ai.state !== 'unloaded'} onClick={() => ai.load()}>
            Download / load
          </button>
          <button disabled={ai.state === 'unloaded'} onClick={() => ai.unload()}>
            Unload / cancel
          </button>
          <button
            onClick={() => {
              if (confirm('Delete this app’s downloaded model cache?')) void act(() => ai.remove());
            }}
          >
            Delete model
          </button>
        </div>
        <p role="status">
          {ai.state} {ai.progress}
        </p>
      </article>
      <label>
        Task
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          {[
            'Suggest a command',
            'Complete a command',
            'Explain a command',
            'Explain this error',
            'Write an ash script',
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <button
        onClick={() => {
          const selection = terminal.term.getSelection();
          if (selection && confirm('Use only this selected terminal text for local AI?'))
            setPrompt(selection);
        }}
      >
        Use approved terminal selection
      </button>
      <textarea
        aria-label="Local assistant prompt"
        placeholder="Describe your task, or paste a command…"
        value={prompt}
        maxLength={6000}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <button
        className="primary"
        disabled={ai.state !== 'ready' || !prompt.trim()}
        onClick={() => ai.generate(`${mode}:\n${prompt}`)}
      >
        Generate locally
      </button>
      {ai.result && (
        <>
          <label>
            Editable suggestion
            <textarea
              aria-label="AI suggestion"
              spellCheck={false}
              value={ai.result}
              onChange={(e) => {
                ai.result = e.target.value;
                ai.dispatchEvent(new Event('change'));
              }}
            />
          </label>
          <p className="warning">
            Untrusted model output. Check destructive operations, overwrites, paths, and quoting.
          </p>
          <div className="row">
            <button onClick={() => act(() => navigator.clipboard.writeText(ai.result))}>
              Copy
            </button>
            <button
              disabled={vm.state !== 'running'}
              onClick={() => {
                terminal.insert(ai.result);
              }}
            >
              Insert as one line
            </button>
          </div>
          <p>
            Insertion never sends Enter. Edit the suggestion down to the command you intend before
            inserting.
          </p>
        </>
      )}
    </div>
  );
}
