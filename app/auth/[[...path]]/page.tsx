"use client";
import { useState, useEffect } from "react";
import { redirectToAuth } from "supertokens-auth-react";
import { canHandleRoute, getRoutingComponent } from "supertokens-auth-react/ui";
import { EmailPasswordPreBuiltUI } from "supertokens-auth-react/recipe/emailpassword/prebuiltui";

const preBuiltUIList = [EmailPasswordPreBuiltUI];

export default function Auth() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (canHandleRoute(preBuiltUIList) === false) {
      redirectToAuth({ redirectBack: false });
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (mounted && canHandleRoute(preBuiltUIList)) {
    return getRoutingComponent(preBuiltUIList);
  }
  return null;
}
