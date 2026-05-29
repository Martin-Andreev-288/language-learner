"use client";
import React from "react";
import { SuperTokensWrapper } from "supertokens-auth-react";
import SuperTokensReact from "supertokens-auth-react";
import { frontendConfig, setRouter } from "@/app/config/frontend";
import { usePathname, useRouter } from "next/navigation";

if (typeof window !== "undefined") {
  SuperTokensReact.init(frontendConfig());
}

export function SuperTokensProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  setRouter(useRouter(), usePathname() || window.location.pathname);
  return <SuperTokensWrapper>{children}</SuperTokensWrapper>;
}
