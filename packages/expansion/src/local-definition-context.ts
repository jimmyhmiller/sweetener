import type { ExpansionEnvironment } from "./environment.js";
import {
  processDefinitionContext,
  type ProcessDefinitionContextOptions,
  type ProcessDefinitionContextResult,
} from "./definition-context.js";

export interface ProcessLocalDefinitionContextOptions extends Omit<
  ProcessDefinitionContextOptions,
  "environment"
> {
  readonly parentEnvironment: ExpansionEnvironment;
}

export interface ProcessLocalDefinitionContextResult {
  /** Complete result used while expanding the lexical region. */
  readonly context: ProcessDefinitionContextResult;
  /** Final child environment visible at the end of the lexical region. */
  readonly localEnvironment: ExpansionEnvironment;
  /** Unchanged environment restored when control leaves the region. */
  readonly exitEnvironment: ExpansionEnvironment;
}

/**
 * Processes one block-local definition context without allowing its syntax
 * bindings to escape. Nested callers use `localEnvironment` while visiting the
 * block and resume with `exitEnvironment` afterwards.
 */
export function processLocalDefinitionContext(
  options: ProcessLocalDefinitionContextOptions,
): ProcessLocalDefinitionContextResult {
  const local = options.store.child(options.parentEnvironment);
  const context = processDefinitionContext({
    ...options,
    environment: local,
  });
  return Object.freeze({
    context,
    localEnvironment: context.environment,
    exitEnvironment: options.parentEnvironment,
  });
}
