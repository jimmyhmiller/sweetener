import { describe, expect, it } from "vitest";
import {
  createResourceBudget,
  ResourceLimitError,
  ResourceTracker,
} from "../src/limits.js";

describe("resource budgets", () => {
  it("tracks each compiler resource", () => {
    const tracker = new ResourceTracker(createResourceBudget());
    tracker.chargeInputTokens(2);
    tracker.chargeOutputTokens(3);
    tracker.chargeExpansionSteps();
    tracker.chargeTemplateSteps(2);
    tracker.chargeMatcherSteps(4);
    tracker.enterNesting();
    expect(tracker.usage).toEqual({
      inputTokens: 2,
      outputTokens: 3,
      expansionSteps: 1,
      templateSteps: 2,
      matcherSteps: 4,
      nestingDepth: 1,
    });
    tracker.leaveNesting();
    expect(tracker.usage.nestingDepth).toBe(0);
  });

  it("reports the resource, limit, and observed value", () => {
    const tracker = new ResourceTracker(
      createResourceBudget({ maxMatcherSteps: 2 }),
    );
    tracker.chargeMatcherSteps(2);
    expect(() => tracker.chargeMatcherSteps()).toThrowError(
      new ResourceLimitError("matcher-steps", 2, 3),
    );
  });

  it("checks an injected deadline clock", () => {
    const tracker = new ResourceTracker(
      createResourceBudget({ deadlineMs: 10 }),
      () => 11,
    );
    expect(() => tracker.checkDeadline()).toThrowError(
      new ResourceLimitError("deadline", 10, 11),
    );
  });

  it("rejects invalid budgets and unbalanced nesting", () => {
    expect(() => createResourceBudget({ maxInputTokens: -1 })).toThrow(
      RangeError,
    );
    const tracker = new ResourceTracker(createResourceBudget());
    expect(() => tracker.leaveNesting()).toThrow(RangeError);
  });
});
