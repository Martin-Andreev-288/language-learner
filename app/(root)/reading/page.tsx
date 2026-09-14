import { auth } from "@/auth";
import AuthPrompt from "@/components/shared/auth-prompt";
import FeatureHub from "@/components/shared/feature-hub";
import { featureSection } from "@/lib/feature-sections";

// Landing page for the section (Question 379). Everything it shows comes
// from lib/feature-sections.ts, so adding a tool here is a line in that file
// rather than an edit to this one.
const section = featureSection("/reading");

export default async function ReadingPage() {
  const session = await auth();

  if (!session) {
    return (
      <AuthPrompt
        featureName={section.title}
        description={section.description}
      />
    );
  }

  return <FeatureHub section={section} />;
}
