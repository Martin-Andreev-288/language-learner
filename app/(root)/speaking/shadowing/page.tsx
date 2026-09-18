import { auth } from "@/auth";
import ShadowingTool from "@/components/shared/shadowing-tool";

// The one tool this app will show a signed-out visitor (Question 399).
//
// Every other page under this layout answers a guest with AuthPrompt and
// never sends the tool's code at all. This one renders the real thing and
// tells it who is looking, so the parts that run in the browser work and
// the three that need a server say what they need instead.
//
// Why this tool and not one of the other sixteen — the reasoning from
// Answer 386, kept here because it is the thing that would be forgotten if
// a second demo page were ever added: most of Shadowing costs nothing to
// run. Playback and the microphone are the browser's own, so a visitor can
// paste a passage and work through it properly without a single server call
// and without spending a request from the daily AI allowance. That matters
// because this app has no rate limiting: anything that called the AI for an
// anonymous visitor would be an open tap.
//
// featureTool() and AuthPrompt are deliberately gone from this file. Both
// existed to describe the tool to someone who could not see it; the tool
// now describes itself.
export default async function ShadowingPracticePage() {
  const session = await auth();

  return <ShadowingTool isAuthenticated={Boolean(session)} />;
}
