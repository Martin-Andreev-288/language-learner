import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The phrases side of Flashcards moved from Reading into Vocabulary, so the
  // old addresses send you on rather than to a 404: a bookmark, or a link
  // saved in a note or sent in a message. Anything after the "?" (a Review
  // due link carries the lists it opens) goes along.
  //
  // Temporary (307) rather than permanent on purpose. A browser keeps a
  // permanent redirect for good, so after checking out an older version of
  // the app locally it would still jump to an address that version doesn't
  // have. A temporary one is asked about again each time and costs nothing.
  async redirects() {
    return [
      {
        source: "/reading/shuffle",
        destination: "/vocabulary/shuffle/phrases",
        permanent: false,
      },
      {
        source: "/reading/shuffle/:path*",
        destination: "/vocabulary/shuffle/phrases/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
