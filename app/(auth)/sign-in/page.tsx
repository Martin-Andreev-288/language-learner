import { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import SignInForm from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign In",
};

const SignInPage = () => {
  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-6 space-y-4">
          <div className="text-center space-y-2">
            <Link href="/" className="inline-block">
              <span className="text-2xl font-bold text-blue-600">
                {APP_NAME}
              </span>
            </Link>
            <h1 className="text-xl font-semibold">Sign In</h1>
            <p className="text-gray-500 text-sm">
              Enter your credentials to access your account
            </p>
          </div>
          <SignInForm />
        </div>
      </div>
    </div>
  );
};

export default SignInPage;
