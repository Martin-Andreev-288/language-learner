import { APP_NAME } from "@/lib/constants";

const Footer = () => {
  const currentYear = new Date().getFullYear();
  return (
    // No top margin (Question 296). A margin is transparent, so the 40px it
    // used to add sat directly on the layout's background image — which is
    // why a strip of it appeared above the footer on every page whose own
    // dark background stopped short of it. The separation it provided is
    // now padding inside the footer instead, where the footer's own colour
    // covers it.
    <footer className="border-t bg-white shadow-inner">
      <div className="flex items-center justify-center px-5 py-6">
        &copy; {currentYear} {APP_NAME}. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;
