import { FEATURE_SECTIONS, STANDALONE_FEATURES } from "./feature-sections";

// The tool you used last, so the signed-in home page can offer a way back
// into it. A cookie rather than localStorage, because the home page is
// rendered on the server: it can read a cookie before the first paint, so
// the Continue panel arrives with the page instead of appearing a moment
// later and pushing the cards down. One per browser, not per account.
export const LAST_TOOL_COOKIE = "last-tool";

export type LastTool = { href: string; name: string };

// "Notes" is the label of five tools, so for those the name that stands on
// its own ("Reading Notes") is used instead. Every other label is already
// unique, and shorter than its authName ("Word List", not "Vocabulary").
const labelCounts = new Map<string, number>();
for (const section of FEATURE_SECTIONS) {
    for (const tool of section.tools) {
        labelCounts.set(tool.label, (labelCounts.get(tool.label) ?? 0) + 1);
    }
}

function belongsTo(pathname: string, href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
}

// Which tool an address belongs to: the tool's own page or anything under
// it, so a Shuffle review counts as that Shuffle. Section pages, the home
// page and unknown addresses give null, and so never replace the last real
// tool. The href returned is always the tool's own, never the address
// passed in — which is what makes it safe to use on a cookie's value.
export function toolForPath(pathname: string): LastTool | null {
    for (const section of FEATURE_SECTIONS) {
        for (const tool of section.tools) {
            if (belongsTo(pathname, tool.href)) {
                const name =
                    (labelCounts.get(tool.label) ?? 0) > 1 ? tool.authName : tool.label;
                return { href: tool.href, name };
            }
        }
    }

    for (const feature of STANDALONE_FEATURES) {
        if (belongsTo(pathname, feature.href)) {
            return { href: feature.href, name: feature.title };
        }
    }

    return null;
}
