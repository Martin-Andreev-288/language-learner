import SuperTokens from "supertokens-node";
import EmailPassword from "supertokens-node/recipe/emailpassword";
import Session from "supertokens-node/recipe/session";
import { appInfo } from "./appInfo";
import { prisma } from "@/lib/prisma";

let initialized = false;

export function ensureSuperTokensInit() {
    if (!initialized) {
        SuperTokens.init({
            framework: "custom",
            supertokens: {
                connectionURI: process.env.SUPERTOKENS_CONNECTION_URI!,
                apiKey: process.env.SUPERTOKENS_API_KEY,
            },
            appInfo,
            recipeList: [
                EmailPassword.init({
                    override: {
                        functions: (original) => ({
                            ...original,
                            async signUp(input) {
                                const result = await original.signUp(input);
                                if (result.status === "OK") {
                                    // Create the User row in your database on sign-up
                                    await prisma.user.create({
                                        data: {
                                            id: result.user.id,            // SuperTokens userId (UUID)
                                            email: result.user.emails[0],
                                        },
                                    });
                                }
                                return result;
                            },
                        }),
                    },
                }),
                Session.init(),
            ],
            isInServerlessEnv: true,
        });
        initialized = true;
    }
}
