import type { Metadata } from "next";
import { IBM_Plex_Mono, Titillium_Web } from "next/font/google";
import "./globals.css";
import "./graph.css";

const factorioFont = Titillium_Web({
    variable: "--font-factorio",
    subsets: ["latin"],
    weight: ["400", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
    variable: "--font-plex-mono",
    subsets: ["latin"],
    weight: ["400", "500"],
});

export const metadata: Metadata = {
    title: "Factorio Tech Tree",
    description: "Interactive graph view of the Factorio tech tree.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body
                className={`${factorioFont.variable} ${ibmPlexMono.variable} antialiased`}
            >
                {children}
            </body>
        </html>
    );
}
