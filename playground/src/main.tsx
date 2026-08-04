import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import CompilerWorker from "./compiler-worker?worker";
import type { CompileResponse } from "./compiler-worker";
import { examples, type PlaygroundFile } from "./examples";
import "./playground.css";

const worker = new CompilerWorker();
let requestId = 0;

const editorTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px", background: "#fff" },
  ".cm-content": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    lineHeight: "1.5",
    padding: "12px 0",
  },
  ".cm-gutters": {
    background: "#fff",
    borderRight: "1px solid #e1e4e8",
    color: "#8c959f",
  },
  ".cm-line": { padding: "0 12px" },
  ".cm-activeLine, .cm-activeLineGutter": { background: "#f6f8fa" },
});

function Editor({
  value,
  readOnly,
  onChange,
}: {
  value: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const change = useRef(onChange);
  change.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    view.current = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          javascript({ typescript: true, jsx: true }),
          keymap.of([...defaultKeymap, indentWithTab]),
          editorTheme,
          EditorState.readOnly.of(Boolean(readOnly)),
          EditorView.editable.of(!readOnly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              change.current?.(update.state.doc.toString());
          }),
        ],
      }),
    });
    return () => view.current?.destroy();
  }, [readOnly]);

  useEffect(() => {
    const current = view.current;
    if (!current || current.state.doc.toString() === value) return;
    current.dispatch({
      changes: { from: 0, to: current.state.doc.length, insert: value },
    });
  }, [value]);

  return <div className="editor" ref={host} />;
}

function copyFiles(files: PlaygroundFile[]) {
  return files.map((file) => ({ ...file }));
}

function App() {
  const initial = examples[0];
  const [exampleId, setExampleId] = useState(initial.id);
  const [entryFileName, setEntryFileName] = useState(initial.entryFileName);
  const [files, setFiles] = useState(() => copyFiles(initial.files));
  const [sourceTab, setSourceTab] = useState(initial.entryFileName);
  const [outputs, setOutputs] = useState<PlaygroundFile[]>([]);
  const [outputTab, setOutputTab] = useState("main.ts");
  const [diagnostics, setDiagnostics] = useState<string[]>(["Compiling…"]);
  const [compiling, setCompiling] = useState(true);

  const source =
    files.find((file) => file.fileName === sourceTab)?.source ?? "";
  const output =
    outputs.find((file) => file.fileName === outputTab)?.source ?? "";

  const compile = useMemo(() => {
    let timer: number | undefined;
    return (nextFiles: PlaygroundFile[], nextEntry: string) => {
      window.clearTimeout(timer);
      setCompiling(true);
      timer = window.setTimeout(() => {
        const id = ++requestId;
        const listener = (event: MessageEvent<CompileResponse>) => {
          if (event.data.id !== id) return;
          worker.removeEventListener("message", listener);
          setCompiling(false);
          if (event.data.error) {
            setOutputs([]);
            setDiagnostics([event.data.error]);
            return;
          }
          const result = event.data.result!;
          setOutputs(result.outputs);
          setDiagnostics(result.diagnostics);
          setOutputTab((current) =>
            result.outputs.some((file) => file.fileName === current)
              ? current
              : (result.outputs.find((file) =>
                  file.fileName.endsWith("main.ts"),
                )?.fileName ??
                result.outputs[0]?.fileName ??
                ""),
          );
        };
        worker.addEventListener("message", listener);
        worker.postMessage({ id, files: nextFiles, entryFileName: nextEntry });
      }, 180);
    };
  }, []);

  useEffect(
    () => compile(files, entryFileName),
    [compile, entryFileName, files],
  );

  const selectExample = (id: string) => {
    const next = examples.find((item) => item.id === id)!;
    setExampleId(id);
    setEntryFileName(next.entryFileName);
    setFiles(copyFiles(next.files));
    setSourceTab(next.entryFileName);
    setOutputTab("main.ts");
  };

  const updateSource = (nextSource: string) => {
    setFiles((current) =>
      current.map((file) =>
        file.fileName === sourceTab ? { ...file, source: nextSource } : file,
      ),
    );
  };

  return (
    <main className="shell">
      <header className="toolbar">
        <strong>Sweetener Playground</strong>
        <label htmlFor="examples">Example</label>
        <select
          id="examples"
          value={exampleId}
          onChange={(event) => selectExample(event.target.value)}
        >
          {[...new Set(examples.map((item) => item.group))].map((group) => (
            <optgroup label={group} key={group}>
              {examples
                .filter((item) => item.group === group)
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <span
          className={
            compiling
              ? "state working"
              : diagnostics.length
                ? "state error"
                : "state ok"
          }
        >
          {compiling
            ? "Compiling…"
            : diagnostics.length
              ? `${diagnostics.length} diagnostic${diagnostics.length === 1 ? "" : "s"}`
              : "No diagnostics"}
        </span>
        <button onClick={() => selectExample(exampleId)}>Reset</button>
      </header>
      <section className="workspace">
        <section className="pane">
          <div className="pane-title">Source</div>
          <div className="tabs" role="tablist">
            {files.map((file) => (
              <button
                className={sourceTab === file.fileName ? "active" : ""}
                onClick={() => setSourceTab(file.fileName)}
                key={file.fileName}
              >
                {file.fileName}
              </button>
            ))}
          </div>
          <Editor value={source} onChange={updateSource} />
          <footer className={diagnostics.length ? "details errors" : "details"}>
            <b>Diagnostics</b>
            <pre>
              {compiling
                ? "Compiling…"
                : diagnostics.length
                  ? diagnostics.join("\n")
                  : "No diagnostics."}
            </pre>
          </footer>
        </section>
        <section className="pane">
          <div className="pane-title">Generated TypeScript</div>
          <div className="tabs" role="tablist">
            {outputs.map((file) => (
              <button
                className={outputTab === file.fileName ? "active" : ""}
                onClick={() => setOutputTab(file.fileName)}
                key={file.fileName}
              >
                {file.fileName}
              </button>
            ))}
          </div>
          <Editor value={output} readOnly />
          <footer className="details output-info">
            <b>Compiler</b>
            <pre>
              Production expansion provider · runs locally in a Web Worker · no
              server
            </pre>
          </footer>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
