import "./globals.css";

export const metadata = {
  title: "Munshi: speak in your language, write like an officer",
  description: "Speak your problem in any Indian language and get a formal letter, read back in your own language.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
