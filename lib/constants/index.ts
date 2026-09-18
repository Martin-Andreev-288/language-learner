export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Foreign Language Learning Tool";
export const APP_DESCRIPTION =
    process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
    "An application to help users learn foreign languages effectively.";
// Where the contact form's mail is sent (Questions 394-396).
//
// Named RECIPIENT rather than CONTACT_EMAIL on purpose. The old name read
// like "the address we display", and it was displayed, until Question 396
// settled that no address should reach the browser at all. A name that
// invites being printed on a page is how that decision gets quietly undone
// by a future edit; this one says what it is for and nothing else.
//
// Still a constant rather than an environment variable, unlike the bcc
// below it, and that is a judgement that rests on one fact: this
// repository is private. If it is ever made public — and Question 384
// suggests that may be the point of it eventually — this line becomes a
// scrapeable address and should move into the environment the same way
// CONTACT_BCC_EMAIL already has.
export const FEEDBACK_RECIPIENT_EMAIL = "xxdead_worldxx@abv.bg";

export const SERVER_URL =
    process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";

export const signInDefaultValues = {
    email: '',
    password: '',
};

export const signUpDefaultValues = {
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
};