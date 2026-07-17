import type { JobBoardProvider, PostingInput, PostingOutcome, PostingRef, SwitchModeInput } from "./job-board";

/** Always requires_manual_action — see the interface doc comment for why that's correct, not a limitation. */
export class MockJobBoardProvider implements JobBoardProvider {
  async createPosting(input: PostingInput): Promise<PostingOutcome> {
    return {
      kind: "requires_manual_action",
      package: {
        copy: input.copy,
        schedulingLink: input.schedulingLink,
        contactNumber: input.contactNumber,
        timing: new Date(),
      },
    };
  }

  async endPosting(_ref: PostingRef): Promise<PostingOutcome> {
    return {
      kind: "requires_manual_action",
      package: { copy: "", schedulingLink: "", contactNumber: "", timing: new Date() },
    };
  }

  async switchMode(_ref: PostingRef, input: SwitchModeInput): Promise<PostingOutcome> {
    return {
      kind: "requires_manual_action",
      package: {
        copy: `Switch posting to ${input.newRoleType} mode`,
        schedulingLink: input.newSchedulingLink,
        contactNumber: input.newContactNumber,
        timing: new Date(),
      },
    };
  }
}
