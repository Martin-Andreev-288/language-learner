"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSSRSession } from "supertokens-node/nextjs";
import Session from "supertokens-node/recipe/session";
import { ensureSuperTokensInit } from "@/app/config/backend";

// Sign the user out — revokes the SuperTokens session server-side
export async function signOutUser() {
    ensureSuperTokensInit();
    const { accessTokenPayload } = await getSSRSession((await cookies()).getAll());
    if (accessTokenPayload?.sessionHandle) {
        await Session.revokeSession(accessTokenPayload.sessionHandle as string);
    }
    redirect("/auth");
}
