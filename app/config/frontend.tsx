import EmailPasswordReact from "supertokens-auth-react/recipe/emailpassword";
import SessionReact from "supertokens-auth-react/recipe/session";
import { appInfo } from "./appInfo";
import { useRouter } from "next/navigation";

const routerInfo: {
  router?: ReturnType<typeof useRouter>;
  pathName?: string;
} = {};

export function setRouter(
  router: ReturnType<typeof useRouter>,
  pathName: string,
) {
  routerInfo.router = router;
  routerInfo.pathName = pathName;
}

export const frontendConfig = () => ({
  appInfo,
  recipeList: [
    EmailPasswordReact.init(),
    SessionReact.init({
      onHandleEvent: (event) => {
        if (event.action === "SESSION_CREATED") {
          routerInfo.router?.refresh();
        }
      },
    }),
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  windowHandler: (original: any) => ({
    ...original,
    location: {
      ...original.location,
      getPathName: () => routerInfo.pathName!,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assign: (url: any) => routerInfo.router!.push(url.toString()),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setHref: (url: any) => routerInfo.router!.push(url.toString()),
    },
  }),
});
