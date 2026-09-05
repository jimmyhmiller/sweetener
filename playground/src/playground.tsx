import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import React, { useEffect, useMemo, useRef, useState } from "react";
import CompilerWorker from "./compiler-worker?worker";
import type { CompileResponse } from "./compiler-worker";
import { examples, type PlaygroundFile } from "./examples";
import { loadGistProject, resolveGistLoad, type GistProject } from "./gist";
import { formatPlaygroundFile } from "./format";
import { sweetHighlighting } from "./sweet-syntax";

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
          // The left pane is .sts and the right is the TypeScript it became,
          // so only one of them is Sweetener.
          readOnly
            ? javascript({ typescript: true, jsx: true })
            : sweetHighlighting,
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

export function Playground({
  exampleId: requested,
  gistId,
  onExample,
  onGist,
  onHome,
}: {
  exampleId: string;
  gistId: string;
  onExample: (id: string) => void;
  onGist: (id: string) => void;
  onHome: () => void;
}) {
  const initial = examples.find((item) => item.id === requested) ?? examples[0];
  const [exampleId, setExampleId] = useState(initial.id);
  const [entryFileName, setEntryFileName] = useState(initial.entryFileName);
  const [files, setFiles] = useState(() => copyFiles(initial.files));
  const [sourceTab, setSourceTab] = useState(initial.entryFileName);
  const [outputs, setOutputs] = useState<PlaygroundFile[]>([]);
  const [outputTab, setOutputTab] = useState(
    initial.entryFileName.endsWith("x") ? "main.tsx" : "main.ts",
  );
  const [diagnostics, setDiagnostics] = useState<string[]>(["Compiling…"]);
  const [compiling, setCompiling] = useState(true);
  const [gistName, setGistName] = useState("");
  const [gistSummary, setGistSummary] = useState("");
  const [gistProject, setGistProject] = useState<GistProject>();
  const [gistReference, setGistReference] = useState("");
  const [gistLoading, setGistLoading] = useState(Boolean(gistId));
  const [gistError, setGistError] = useState("");
  const [gistReload, setGistReload] = useState(0);
  const [formatError, setFormatError] = useState("");

  const summary =
    exampleId === "gist"
      ? gistSummary
      : (examples.find((item) => item.id === exampleId)?.summary ?? "");
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
          // A module of nothing but macro definitions expands to nothing:
          // macros are compile-time only. A tab onto an empty file suggests
          // the expansion produced something it did not.
          const written = result.outputs.filter(
            (file) => file.source.trim().length > 0,
          );
          setOutputs(written);
          setDiagnostics(result.diagnostics);
          setOutputTab((current) =>
            written.some((file) => file.fileName === current)
              ? current
              : (written.find((file) => file.fileName.startsWith("main."))
                  ?.fileName ??
                written[0]?.fileName ??
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

  useEffect(() => {
    if (!gistId) return;
    const controller = new AbortController();
    setGistLoading(true);
    setGistError("");
    loadGistProject(gistId, controller.signal)
      .then((project) => {
        setFormatError("");
        setGistProject(project);
        setExampleId("gist");
        setGistName(project.name);
        setGistSummary(project.summary);
        setEntryFileName(project.entryFileName);
        setFiles(copyFiles(project.files));
        setSourceTab(project.entryFileName);
        setOutputTab(
          project.entryFileName.endsWith("x") ? "main.tsx" : "main.ts",
        );
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setGistError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setGistLoading(false);
      });
    return () => controller.abort();
  }, [gistId, gistReload]);

  const selectExample = (id: string) => {
    const next = examples.find((item) => item.id === id)!;
    setFormatError("");
    setExampleId(id);
    setGistName("");
    setGistSummary("");
    setGistProject(undefined);
    onExample(id);
    setEntryFileName(next.entryFileName);
    setFiles(copyFiles(next.files));
    setSourceTab(next.entryFileName);
    setOutputTab(next.entryFileName.endsWith("x") ? "main.tsx" : "main.ts");
  };

  const submitGist = (event: React.FormEvent) => {
    event.preventDefault();
    const request = resolveGistLoad(gistReference, gistId);
    if (request === undefined) {
      setGistError("Enter a GitHub Gist URL or ID.");
      return;
    }
    setGistError("");
    if (request.reload) setGistReload((current) => current + 1);
    else onGist(request.id);
  };

  const resetCurrent = () => {
    if (exampleId !== "gist" || gistProject === undefined) {
      selectExample(exampleId);
      return;
    }
    setEntryFileName(gistProject.entryFileName);
    setFiles(copyFiles(gistProject.files));
    setSourceTab(gistProject.entryFileName);
    setOutputTab(
      gistProject.entryFileName.endsWith("x") ? "main.tsx" : "main.ts",
    );
  };

  const updateSource = (nextSource: string) => {
    setFormatError("");
    setFiles((current) =>
      current.map((file) =>
        file.fileName === sourceTab ? { ...file, source: nextSource } : file,
      ),
    );
  };

  const formatSource = async () => {
    try {
      updateSource(await formatPlaygroundFile(sourceTab, source));
    } catch (error) {
      setFormatError(error instanceof Error ? error.message : String(error));
    }
  };

  const formatOutput = async () => {
    try {
      const formatted = await formatPlaygroundFile(outputTab, output);
      setOutputs((current) =>
        current.map((file) =>
          file.fileName === outputTab ? { ...file, source: formatted } : file,
        ),
      );
      setFormatError("");
    } catch (error) {
      setFormatError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <main className="shell">
      <header className="toolbar">
        <button className="home" onClick={onHome}>
          Sweetener
        </button>
        <label htmlFor="examples">Example</label>
        <select
          id="examples"
          value={exampleId}
          onChange={(event) => selectExample(event.target.value)}
        >
          {exampleId === "gist" ? (
            <option value="gist">{gistName}</option>
          ) : null}
          {examples.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <form className="gist-loader" onSubmit={submitGist}>
          <input
            aria-label="GitHub Gist URL or ID"
            placeholder="Gist URL or ID"
            value={gistReference}
            onChange={(event) => {
              setGistReference(event.target.value);
              setGistError("");
            }}
          />
          <button type="submit">Load Gist</button>
        </form>
        <span
          className={
            gistLoading || compiling
              ? "state working"
              : gistError || formatError || diagnostics.length
                ? "state error"
                : "state ok"
          }
        >
          {gistLoading
            ? "Loading Gist…"
            : gistError
              ? "Gist error"
              : formatError
                ? "Format error"
                : compiling
                  ? "Compiling…"
                  : diagnostics.length
                    ? `${diagnostics.length} diagnostic${diagnostics.length === 1 ? "" : "s"}`
                    : "No diagnostics"}
        </span>
        <button onClick={resetCurrent}>Reset</button>
      </header>
      {gistError ? (
        <div className="gist-error" role="alert">
          <b>Could not load Gist.</b> {gistError}
        </div>
      ) : null}
      <section className="workspace">
        <section className="pane">
          <div className="pane-heading">
            <div className="pane-title">Source</div>
            <button
              aria-label={`Format ${sourceTab}`}
              onClick={() => void formatSource()}
              disabled={!source}
            >
              Format
            </button>
          </div>
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
          <footer
            className={
              gistError || formatError || diagnostics.length
                ? "details errors"
                : "details"
            }
          >
            <b>Diagnostics</b>
            <pre>
              {gistLoading
                ? "Loading Gist…"
                : formatError
                  ? formatError
                  : gistError
                    ? gistError
                    : compiling
                      ? "Compiling…"
                      : diagnostics.length
                        ? diagnostics.join("\n")
                        : "No diagnostics."}
            </pre>
          </footer>
        </section>
        <section className="pane">
          <div className="pane-heading">
            <div className="pane-title">Generated TypeScript</div>
            <button
              aria-label={`Format ${outputTab}`}
              onClick={() => void formatOutput()}
              disabled={compiling || !output}
            >
              Format
            </button>
          </div>
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
            <b>About</b>
            <pre>
              {summary}
              {"\n"}Expanded in your browser by the same compiler the command
              line uses.
            </pre>
          </footer>
        </section>
      </section>
    </main>
  );
}
